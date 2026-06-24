const express = require('express');
const router  = express.Router();
const { spawn } = require('child_process');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

// Estado global da transmissão
let liveProcess    = null;  // processo ffmpeg (modo video loop) ou 'camera' (modo câmara)
let liveInfo       = null;
let segCounter     = 0;
let cameraSegments = [];    // lista de segmentos .ts do modo câmara

const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../hls/live/chunks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `chunk_${Date.now()}.mp4`),
});
const chunkUpload = multer({ storage: chunkStorage });

function liveDir() {
  return path.join(__dirname, '../../hls/live');
}

// GET /api/live/status — público, sem mTLS (chamado pelo mobile via HTTP :3001)
router.get('/status', (req, res) => {
  // Importar o estado TCP sem criar dependência circular
  let tcpAtivo = false;
  let tcpInfo  = null;
  try {
    const tb = require('../services/tcp-broadcast');
    // Aceder ao estado via instância global (exposta no server.js via global)
    tcpAtivo = global.__tcpBroadcast?.isLive?.() ?? false;
    tcpInfo  = global.__tcpBroadcast?.getInfo?.() ?? null;
  } catch {}

  const hlsAtivo = liveProcess !== null;

  res.json({
    ao_vivo:    hlsAtivo || tcpAtivo,
    modo:       tcpAtivo ? 'tcp' : (hlsAtivo ? 'hls' : null),
    titulo:     liveInfo?.titulo ?? tcpInfo?.titulo ?? null,
    iniciadoEm: liveInfo?.iniciadoEm ?? tcpInfo?.iniciadoEm ?? null,
    url:        hlsAtivo ? '/hls/live/index.m3u8' : null,
    tcp_porta:  9999,
  });
});

// POST /api/live/start — chamado pelo admin (via mTLS :3000 + token admin)
router.post('/start', (req, res) => {
  if (liveProcess) return res.status(409).json({ error: 'Já existe uma transmissão ativa.' });

  const { sourcePath, titulo = 'Transmissão ao Vivo' } = req.body;
  // Resolver path relativo à raiz do backend
  const backendRoot = path.join(__dirname, '../../');
  const resolvedPath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(backendRoot, sourcePath);
  if (!sourcePath || !fs.existsSync(resolvedPath))
    return res.status(400).json({ error: 'Caminho de vídeo inválido.' });

  const dir = liveDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Limpar segmentos antigos
  fs.readdirSync(dir).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });

  const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = [
    '-re', '-stream_loop', '-1', '-i', resolvedPath,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
    '-g', '30', '-keyint_min', '30',   // keyframe a cada 1s (30fps) para cortes limpos
    '-vf', 'scale=854:480',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '1',                  // segmentos de 1s — menos latência
    '-hls_list_size', '3',             // apenas 3 segmentos no playlist
    '-hls_flags', 'delete_segments+append_list',
    path.join(dir, 'index.m3u8'),
  ];

  liveProcess = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  liveInfo    = { titulo, iniciadoEm: new Date().toISOString() };

  liveProcess.on('close', () => { liveProcess = null; liveInfo = null; });
  liveProcess.stderr.on('data', () => {});

  res.json({ message: 'Transmissão iniciada.', titulo });
});

// POST /api/live/stop
router.post('/stop', (req, res) => {
  if (!liveProcess) return res.status(404).json({ error: 'Nenhuma transmissão ativa.' });

  liveProcess.kill('SIGTERM');
  liveProcess = null;
  liveInfo    = null;

  // Limpar segmentos
  const dir = liveDir();
  if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });

  res.json({ message: 'Transmissão encerrada.' });
});

// POST /api/live/chunk — recebe chunk de vídeo da câmara e gera segmento HLS
router.post('/chunk', chunkUpload.single('chunk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chunk não recebido.' });

  const chunkPath = req.file.path;
  const dir = liveDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const segName    = `seg${String(segCounter++).padStart(5, '0')}.ts`;
  const segPath    = path.join(dir, segName);
  const ffmpegBin  = process.env.FFMPEG_PATH || 'ffmpeg';

  try {
    // Remuxar mp4 → .ts sem re-encodar (câmara já grava H.264 — muito mais rápido)
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, [
        '-i', chunkPath,
        '-c', 'copy',          // sem re-encoding: apenas mudar container
        '-f', 'mpegts', '-y', segPath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      proc.on('close', code => {
        if (code === 0) return resolve();
        // Fallback: re-encodar se copy falhar (ex: áudio incompatível)
        const proc2 = spawn(ffmpegBin, [
          '-i', chunkPath,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
          '-f', 'mpegts', '-y', segPath,
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        proc2.on('close', c2 => c2 === 0 ? resolve() : reject(new Error(`ffmpeg: ${c2}`)));
        proc2.stderr.on('data', () => {});
      });
      proc.stderr.on('data', () => {});
    });
  } catch (e) {
    try { fs.unlinkSync(chunkPath); } catch {}
    return res.status(500).json({ error: 'Falha ao converter chunk.' });
  }

  try { fs.unlinkSync(chunkPath); } catch {}

  // Manter janela deslizante de 3 segmentos (menos buffer = menos latência)
  cameraSegments.push(segName);
  if (cameraSegments.length > 3) {
    const old = cameraSegments.shift();
    try { fs.unlinkSync(path.join(dir, old)); } catch {}
  }

  // Escrever m3u8 actualizado
  const seq   = Math.max(0, segCounter - cameraSegments.length);
  const m3u8  = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:3',
    `#EXT-X-MEDIA-SEQUENCE:${seq}`,
    ...cameraSegments.flatMap(s => ['#EXTINF:2.0,', s]),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'index.m3u8'), m3u8);

  // Marcar como ao vivo (modo câmara)
  if (!liveProcess) {
    const titulo = req.body?.titulo || req.headers['x-live-titulo'] || 'Transmissão ao Vivo';
    liveInfo    = { titulo, iniciadoEm: new Date().toISOString() };
    liveProcess = 'camera'; // marcador (sem processo ffmpeg contínuo)
  }

  res.json({ ok: true, segmento: segName, total: cameraSegments.length });
});

// POST /api/live/stop-camera — encerra modo câmara
router.post('/stop-camera', (req, res) => {
  liveProcess    = null;
  liveInfo       = null;
  cameraSegments = [];
  segCounter     = 0;

  // Limpar segmentos e m3u8
  const dir = liveDir();
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
  }

  res.json({ message: 'Transmissão câmara encerrada.' });
});

module.exports = router;
