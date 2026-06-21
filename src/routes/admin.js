const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken, apenasAdmin } = require('../middleware/auth');

// Todos os endpoints admin requerem token + role admin
router.use(verificarToken, apenasAdmin);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  res.json(db.obterEstatisticas());
});

// ─── UTILIZADORES ─────────────────────────────────────────────────────────────

// GET /api/admin/utilizadores
router.get('/utilizadores', (req, res) => {
  const { q } = req.query;
  let users = db.listarUtilizadores();
  if (q) {
    const query = q.toLowerCase();
    users = users.filter(u => u.nome.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
  }
  res.json(users);
});

// POST /api/admin/utilizadores — Criar utilizador manualmente
router.post('/utilizadores', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { nome, email, password, role = 'user' } = req.body;
  if (!nome || !email || !password)
    return res.status(400).json({ error: 'Nome, email e password são obrigatórios.' });
  if (!['user', 'admin'].includes(role))
    return res.status(400).json({ error: 'Role inválido.' });
  if (db.buscarUtilizadorPorEmail(email))
    return res.status(409).json({ error: 'Já existe um utilizador com este email.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.criarUtilizador({ nome, email, passwordHash, role });
  db.registarAuditoria({
    adminId: req.user.id, acao: 'UTILIZADOR_CRIADO',
    entidade: 'utilizador', entidadeId: user.id,
    detalhe: `Conta criada pelo admin: ${email} (${role})`
  });
  res.status(201).json({ message: 'Utilizador criado com sucesso.', user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
});

// PATCH /api/admin/utilizadores/:id/estado — Suspender / Bloquear / Reativar
router.patch('/utilizadores/:id/estado', (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['ativo', 'suspenso', 'bloqueado'];
  if (!estadosValidos.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });

  const ok = db.atualizarEstadoUtilizador(req.params.id, estado);
  if (!ok) return res.status(404).json({ error: 'Utilizador não encontrado.' });

  const user = db.buscarUtilizadorPorId(req.params.id);
  db.registarAuditoria({
    adminId: req.user.id, acao: `UTILIZADOR_${estado.toUpperCase()}`,
    entidade: 'utilizador', entidadeId: req.params.id,
    detalhe: `Conta de ${user?.email} alterada para ${estado}`
  });

  res.json({ message: `Utilizador ${estado} com sucesso.` });
});

// ─── VÍDEOS ───────────────────────────────────────────────────────────────────

// GET /api/admin/videos
router.get('/videos', (req, res) => {
  const { estado = 'ativo', q } = req.query;
  let videos = q ? db.pesquisarVideos(q) : db.listarVideos({ estado });

  const resultado = videos.map(v => ({
    ...v,
    likes: db.contarLikes(v.id),
    denuncias: db.contarDenunciasVideo(v.id),
    autor: (() => { const u = db.buscarUtilizadorPorId(v.autorId); return u ? { id: u.id, nome: u.nome, email: u.email } : null; })()
  }));

  res.json(resultado);
});

// PATCH /api/admin/videos/:id/estado — Ocultar / Remover / Reativar
router.patch('/videos/:id/estado', (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['ativo', 'oculto', 'removido'];
  if (!estadosValidos.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });

  const ok = db.atualizarEstadoVideo(req.params.id, estado);
  if (!ok) return res.status(404).json({ error: 'Vídeo não encontrado.' });

  db.registarAuditoria({
    adminId: req.user.id, acao: `VIDEO_${estado.toUpperCase()}`,
    entidade: 'video', entidadeId: req.params.id,
    detalhe: `Vídeo marcado como ${estado}`
  });

  res.json({ message: `Vídeo ${estado} com sucesso.` });
});

// ─── DENÚNCIAS ────────────────────────────────────────────────────────────────

// GET /api/admin/denuncias
router.get('/denuncias', (req, res) => {
  const { estado } = req.query;
  const denuncias = db.listarDenuncias({ estado });

  const resultado = denuncias.map(d => {
    const video = db.buscarVideoPorId(d.videoId);
    const denunciante = db.buscarUtilizadorPorId(d.denuncianteId);
    return {
      ...d,
      video: video ? { id: video.id, titulo: video.titulo, estado: video.estado } : null,
      denunciante: denunciante ? { id: denunciante.id, nome: denunciante.nome } : null
    };
  });

  res.json(resultado);
});

// PATCH /api/admin/denuncias/:id — Resolver denúncia
router.patch('/denuncias/:id', (req, res) => {
  const { estado, removerVideo, suspenderAutor } = req.body;
  const estadosValidos = ['aprovada', 'rejeitada'];
  if (!estadosValidos.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });

  const ok = db.atualizarDenuncia(req.params.id, estado);
  if (!ok) return res.status(404).json({ error: 'Denúncia não encontrada.' });

  // Acções automáticas se aprovada
  if (estado === 'aprovada') {
    const denuncia = db.listarDenuncias().find(d => d.id === req.params.id);
    if (denuncia) {
      if (removerVideo) db.atualizarEstadoVideo(denuncia.videoId, 'removido');
      if (suspenderAutor) {
        const video = db.buscarVideoPorId(denuncia.videoId);
        if (video) db.atualizarEstadoUtilizador(video.autorId, 'suspenso');
      }
    }
  }

  db.registarAuditoria({
    adminId: req.user.id, acao: `DENUNCIA_${estado.toUpperCase()}`,
    entidade: 'denuncia', entidadeId: req.params.id,
    detalhe: `Denúncia ${estado}${removerVideo ? ' + vídeo removido' : ''}${suspenderAutor ? ' + autor suspenso' : ''}`
  });

  res.json({ message: `Denúncia ${estado} com sucesso.` });
});

// ─── COMENTÁRIOS ──────────────────────────────────────────────────────────────

// DELETE /api/admin/comentarios/:id
router.delete('/comentarios/:id', (req, res) => {
  const ok = db.removerComentario(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Comentário não encontrado.' });

  db.registarAuditoria({
    adminId: req.user.id, acao: 'COMENTARIO_REMOVIDO',
    entidade: 'comentario', entidadeId: req.params.id, detalhe: 'Comentário removido pelo admin'
  });

  res.json({ message: 'Comentário removido.' });
});

// ─── CATEGORIAS ───────────────────────────────────────────────────────────────

// GET /api/admin/categorias
router.get('/categorias', (req, res) => res.json(db.listarCategorias()));

// POST /api/admin/categorias
router.post('/categorias', (req, res) => {
  const { nome, icone } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const categoria = db.criarCategoria({ nome, icone: icone || '📌' });
  res.status(201).json(categoria);
});

// ─── AUDITORIA ────────────────────────────────────────────────────────────────

// GET /api/admin/auditoria
router.get('/auditoria', (req, res) => {
  const logs = db.listarAuditoria().reverse(); // Mais recentes primeiro
  res.json(logs);
});

module.exports = router;
