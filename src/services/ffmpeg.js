const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Configurar caminhos explícitos para ffmpeg/ffprobe (necessário quando não está no PATH)
if (process.env.FFMPEG_PATH)  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

const MAX_DURACAO = parseInt(process.env.MAX_VIDEO_DURATION) || 900; // 15 minutos

// ─── OBTER METADADOS (duração, resolução, etc.) ───────────────────────────────
function obterMetadados(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}

// ─── VALIDAR DURAÇÃO (máx 15 minutos) ────────────────────────────────────────
async function validarDuracao(filePath) {
  const meta = await obterMetadados(filePath);
  const duracao = meta.format.duration; // em segundos
  return {
    valido: duracao <= MAX_DURACAO,
    duracao: Math.round(duracao),
    duracaoMaxima: MAX_DURACAO
  };
}

// ─── CORTAR VÍDEO ao limite máximo ───────────────────────────────────────────
function cortarVideo(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/\.[^.]+$/, '_cortado.mp4');
    ffmpeg(inputPath)
      .setDuration(MAX_DURACAO)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// ─── COMPRESSÃO DE VÍDEO (H.264) ─────────────────────────────────────────────
function comprimirVideo(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp4');
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-crf 28',
        '-preset fast',
        '-movflags +faststart'  // Optimiza para streaming web
      ])
      .output(outputPath)
      .on('end', () => {
        const tamanhoOriginal  = fs.statSync(inputPath).size;
        const tamanhoComprimido = fs.statSync(outputPath).size;
        resolve({ outputPath, tamanhoOriginal, tamanhoComprimido });
      })
      .on('error', reject)
      .run();
  });
}

// ─── GERAR THUMBNAIL ─────────────────────────────────────────────────────────
function gerarThumbnail(inputPath, videoId) {
  return new Promise((resolve, reject) => {
    const thumbDir = 'uploads/thumbnails';
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    ffmpeg(inputPath)
      .screenshots({
        count: 1,
        folder: thumbDir,
        filename: `${videoId}.jpg`,
        timemarks: ['00:00:02'] // Captura no segundo 2
      })
      .on('end', () => resolve(`uploads/thumbnails/${videoId}.jpg`))
      .on('error', () => resolve(null)); // Falha silenciosa — thumbnail não é crítico
  });
}

// ─── GERAR HLS (Streaming) ────────────────────────────────────────────────────
function gerarHLS(inputPath, videoId) {
  return new Promise((resolve, reject) => {
    const hlsDir = path.join('hls', videoId);
    if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

    const playlistPath = path.join(hlsDir, 'index.m3u8');

    ffmpeg(inputPath)
      .outputOptions([
        '-codec: copy',
        '-start_number 0',
        '-hls_time 6',        // Segmentos de 6 segundos (ideal para vídeos curtos)
        '-hls_list_size 0',
        '-f hls'
      ])
      .output(playlistPath)
      .on('end', () => resolve({ hlsPath: `hls/${videoId}/index.m3u8` }))
      .on('error', (err) => {
        console.warn('HLS falhou, usando stream directo:', err.message);
        resolve({ hlsPath: null });
      })
      .run();
  });
}

module.exports = { obterMetadados, validarDuracao, cortarVideo, comprimirVideo, gerarThumbnail, gerarHLS };
