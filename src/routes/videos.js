const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const db = require('../database');
const { verificarToken, contaActiva } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { validarDuracao, cortarVideo, comprimirVideo, gerarThumbnail, gerarHLS } = require('../services/ffmpeg');

// GET /api/videos — Feed principal (scroll infinito estilo TikTok)
router.get('/', (req, res) => {
  const { pagina = 1, limite = 10, categoriaId, q } = req.query;
  const userId = req.headers['authorization'] ? (() => {
    try {
      const jwt = require('jsonwebtoken');
      const token = req.headers['authorization'].split(' ')[1];
      return jwt.verify(token, process.env.JWT_SECRET || 'ocorrencias_secret_2026').id;
    } catch { return null; }
  })() : null;

  let videos = q ? db.pesquisarVideos(q) : db.listarVideos({ categoriaId });

  const total = videos.length;
  const inicio = (pagina - 1) * limite;
  videos = videos.slice(inicio, inicio + parseInt(limite));

  const resultado = videos.map(v => {
    const autor = db.buscarUtilizadorPorId(v.autorId);
    return {
      id: v.id,
      titulo: v.titulo,
      descricao: v.descricao,
      categoriaId: v.categoriaId,
      localizacao: v.localizacao,
      thumbnail: v.thumbnail,
      duracao: v.duracao,
      views: v.views,
      likes: db.contarLikes(v.id),
      likedPorMim: userId ? db.utilizadorDeuLike(v.id, userId) : false,
      guardadoPorMim: userId ? db.estaGuardado(v.id, userId) : false,
      denuncias: db.contarDenunciasVideo(v.id),
      autor: autor ? { id: autor.id, nome: autor.nome } : null,
      criadoEm: v.criadoEm
    };
  });

  res.json({ videos: resultado, total, pagina: parseInt(pagina), totalPaginas: Math.ceil(total / limite) });
});

// GET /api/videos/meus — Vídeos do utilizador autenticado
router.get('/meus', verificarToken, (req, res) => {
  const videos = db.listarVideosPorAutor(req.user.id);
  const resultado = videos.map(v => {
    const autor = db.buscarUtilizadorPorId(v.autorId);
    return {
      id: v.id, titulo: v.titulo, descricao: v.descricao,
      thumbnail: v.thumbnail, duracao: v.duracao,
      views: v.views, likes: db.contarLikes(v.id),
      likedPorMim: db.utilizadorDeuLike(v.id, req.user.id),
      guardadoPorMim: db.estaGuardado(v.id, req.user.id),
      categoriaId: v.categoriaId, localizacao: v.localizacao,
      autor: autor ? { id: autor.id, nome: autor.nome } : null,
      criadoEm: v.criadoEm
    };
  });
  res.json(resultado);
});

// GET /api/videos/guardados — Vídeos guardados pelo utilizador
router.get('/guardados', verificarToken, (req, res) => {
  const videos = db.listarGuardados(req.user.id);
  const resultado = videos.map(v => {
    const autor = db.buscarUtilizadorPorId(v.autorId);
    return {
      id: v.id, titulo: v.titulo, descricao: v.descricao,
      thumbnail: v.thumbnail, duracao: v.duracao,
      views: v.views, likes: db.contarLikes(v.id),
      likedPorMim: db.utilizadorDeuLike(v.id, req.user.id),
      guardadoPorMim: true,
      categoriaId: v.categoriaId, localizacao: v.localizacao,
      autor: autor ? { id: autor.id, nome: autor.nome } : null,
      criadoEm: v.criadoEm
    };
  });
  res.json(resultado);
});

// GET /api/videos/:id — Detalhe de um vídeo
router.get('/:id', (req, res) => {
  const video = db.buscarVideoPorId(req.params.id);
  if (!video || video.estado === 'removido')
    return res.status(404).json({ error: 'Vídeo não encontrado.' });

  db.incrementarViews(video.id);
  const autor = db.buscarUtilizadorPorId(video.autorId);
  const host = `${req.protocol}://${req.get('host')}`;

  res.json({
    ...video,
    streamUrl: `${host}/api/stream/${video.id}`,
    hlsUrl: video.hlsPath ? `${host}/${video.hlsPath}` : null,
    likes: db.contarLikes(video.id),
    autor: autor ? { id: autor.id, nome: autor.nome } : null
  });
});

// POST /api/videos/upload — Upload de vídeo (requer autenticação + conta activa)
router.post('/upload', verificarToken, contaActiva, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum vídeo enviado.' });

    const { titulo, descricao, categoriaId, latitude, longitude, morada, termoAceite } = req.body;

    if (!titulo) return res.status(400).json({ error: 'O título é obrigatório.' });

    // ── Verificar termo de responsabilidade ─────────────────────────────────
    if (termoAceite !== 'true' && termoAceite !== true) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Deve aceitar o termo de responsabilidade para publicar.' });
    }

    let filePath = req.file.path;

    // ── Validar duração (máx 15 min) ────────────────────────────────────────
    const { valido, duracao } = await validarDuracao(filePath);
    if (!valido) {
      // Cortar automaticamente ao limite
      filePath = await cortarVideo(filePath);
    }

    // ── Compressão automática ────────────────────────────────────────────────
    let tamanhoOriginal = req.file.size;
    let tamanhoComprimido = req.file.size;
    try {
      const compressao = await comprimirVideo(filePath);
      filePath = compressao.outputPath;
      tamanhoOriginal = compressao.tamanhoOriginal;
      tamanhoComprimido = compressao.tamanhoComprimido;
    } catch (e) {
      console.warn('Compressão falhou:', e.message);
    }

    // ── Criar registo na BD (para obter o ID antes do HLS) ──────────────────
    const localizacao = (latitude && longitude) ? { latitude, longitude, morada } : null;
    const video = db.criarVideo({
      titulo, descricao, categoriaId, localizacao,
      ficheiro: filePath, hlsPath: null,
      tamanhoOriginal, tamanhoComprimido,
      duracao: Math.min(duracao, 900),
      autorId: req.user.id
    });

    // ── Thumbnail + HLS em paralelo ──────────────────────────────────────────
    const [thumb, hls] = await Promise.all([
      gerarThumbnail(filePath, video.id),
      gerarHLS(filePath, video.id)
    ]);

    video.thumbnail = thumb;
    video.hlsPath = hls.hlsPath;

    res.status(201).json({ message: 'Vídeo publicado com sucesso!', video });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/:id/like — Dar/remover like
router.post('/:id/like', verificarToken, contaActiva, (req, res) => {
  const video = db.buscarVideoPorId(req.params.id);
  if (!video || video.estado !== 'ativo')
    return res.status(404).json({ error: 'Vídeo não encontrado.' });

  const resultado = db.toggleLike(video.id, req.user.id);
  res.json({ ...resultado, totalLikes: db.contarLikes(video.id) });
});

// GET /api/videos/:id/comentarios — Listar comentários
router.get('/:id/comentarios', (req, res) => {
  const comentarios = db.listarComentarios(req.params.id);
  res.json(comentarios);
});

// POST /api/videos/:id/comentarios — Adicionar comentário
router.post('/:id/comentarios', verificarToken, contaActiva, (req, res) => {
  const { texto } = req.body;
  if (!texto || texto.trim().length < 1)
    return res.status(400).json({ error: 'O comentário não pode estar vazio.' });

  const video = db.buscarVideoPorId(req.params.id);
  if (!video || video.estado !== 'ativo')
    return res.status(404).json({ error: 'Vídeo não encontrado.' });

  const comentario = db.criarComentario({ videoId: video.id, userId: req.user.id, texto: texto.trim() });
  const autor = db.buscarUtilizadorPorId(req.user.id);
  res.status(201).json({ ...comentario, autorNome: autor?.nome });
});

// POST /api/videos/:id/guardar — Guardar/remover dos guardados
router.post('/:id/guardar', verificarToken, contaActiva, (req, res) => {
  const video = db.buscarVideoPorId(req.params.id);
  if (!video || video.estado !== 'ativo')
    return res.status(404).json({ error: 'Vídeo não encontrado.' });

  const resultado = db.toggleGuardado(video.id, req.user.id);
  res.json(resultado);
});

// POST /api/videos/:id/denunciar — Denunciar vídeo
router.post('/:id/denunciar', verificarToken, (req, res) => {
  const { motivo, descricao } = req.body;

  if (!motivo || !db.MOTIVOS_DENUNCIA.includes(motivo))
    return res.status(400).json({ error: 'Motivo inválido.', motivosValidos: db.MOTIVOS_DENUNCIA });

  const video = db.buscarVideoPorId(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });

  const denuncia = db.criarDenuncia({ videoId: video.id, denuncianteId: req.user.id, motivo, descricao });
  res.status(201).json({ message: 'Denúncia registada. Obrigado pelo relatório.', denuncia });
});

module.exports = router;
