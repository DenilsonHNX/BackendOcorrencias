const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');

// ─── PERSISTÊNCIA ─────────────────────────────────────────────────────────────

const DATA_DIR  = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

const CATEGORIAS_PADRAO = [
  { id: uuidv4(), nome: 'Trânsito',       icone: '🚗' },
  { id: uuidv4(), nome: 'Acidentes',      icone: '🚨' },
  { id: uuidv4(), nome: 'Obras Públicas', icone: '🚧' },
  { id: uuidv4(), nome: 'Segurança',      icone: '🔒' },
  { id: uuidv4(), nome: 'Saúde',          icone: '🏥' },
  { id: uuidv4(), nome: 'Eventos',        icone: '📢' },
  { id: uuidv4(), nome: 'Emergências',    icone: '🆘' },
  { id: uuidv4(), nome: 'Inundações',     icone: '🌊' },
  { id: uuidv4(), nome: 'Incêndios',      icone: '🔥' },
  { id: uuidv4(), nome: 'Outros',         icone: '📌' },
];

// Carregar dados do ficheiro JSON ao iniciar
function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null;
  }
}

const saved = loadDB();

const db = {
  users:      saved?.users      ?? [],
  videos:     saved?.videos     ?? [],
  likes:      saved?.likes      ?? [],
  comentarios: saved?.comentarios ?? [],
  denuncias:  saved?.denuncias  ?? [],
  categorias: saved?.categorias ?? CATEGORIAS_PADRAO,
  auditoria:  saved?.auditoria  ?? [],
};

// Guardar com debounce (evita escrita excessiva em disco)
let _saveTimer = null;
function saveDB() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  }, 300);
}

// ─── UTILIZADORES ─────────────────────────────────────────────────────────────

function criarUtilizador({ nome, email, passwordHash, role = 'user' }) {
  const user = {
    id: uuidv4(), nome, email, passwordHash, role,
    estado: 'ativo',
    infracoes: 0,
    criadoEm: new Date()
  };
  db.users.push(user);
  saveDB();
  return user;
}

function buscarUtilizadorPorEmail(email) {
  return db.users.find(u => u.email === email);
}

function buscarUtilizadorPorId(id) {
  return db.users.find(u => u.id === id);
}

function listarUtilizadores() {
  return db.users.map(u => ({
    id: u.id, nome: u.nome, email: u.email,
    role: u.role, estado: u.estado, infracoes: u.infracoes, criadoEm: u.criadoEm
  }));
}

function atualizarEstadoUtilizador(id, estado) {
  const user = buscarUtilizadorPorId(id);
  if (user) { user.estado = estado; saveDB(); return true; }
  return false;
}

// ─── VÍDEOS ───────────────────────────────────────────────────────────────────

function criarVideo({ titulo, descricao, categoriaId, localizacao, ficheiro, hlsPath, tamanhoOriginal, tamanhoComprimido, duracao, autorId }) {
  const video = {
    id: uuidv4(), titulo, descricao, categoriaId,
    localizacao,
    ficheiro, hlsPath,
    tamanhoOriginal, tamanhoComprimido,
    taxaCompressao: tamanhoOriginal ? ((1 - tamanhoComprimido / tamanhoOriginal) * 100).toFixed(1) + '%' : null,
    duracao,
    autorId,
    estado: 'ativo',
    views: 0,
    criadoEm: new Date()
  };
  db.videos.push(video);
  saveDB();
  return video;
}

function listarVideos({ estado = 'ativo', categoriaId, autorId } = {}) {
  return db.videos.filter(v =>
    v.estado === estado &&
    (!categoriaId || v.categoriaId === categoriaId) &&
    (!autorId || v.autorId === autorId)
  );
}

function buscarVideoPorId(id) {
  return db.videos.find(v => v.id === id);
}

function pesquisarVideos(query) {
  const q = query.toLowerCase();
  return db.videos.filter(v =>
    v.estado === 'ativo' && (
      v.titulo.toLowerCase().includes(q) ||
      v.descricao?.toLowerCase().includes(q)
    )
  );
}

function incrementarViews(id) {
  const v = buscarVideoPorId(id);
  if (v) { v.views++; saveDB(); }
}

function atualizarEstadoVideo(id, estado) {
  const v = buscarVideoPorId(id);
  if (v) { v.estado = estado; saveDB(); return true; }
  return false;
}

// ─── LIKES ────────────────────────────────────────────────────────────────────

function toggleLike(videoId, userId) {
  const idx = db.likes.findIndex(l => l.videoId === videoId && l.userId === userId);
  if (idx >= 0) {
    db.likes.splice(idx, 1);
    saveDB();
    return { liked: false };
  }
  db.likes.push({ id: uuidv4(), videoId, userId, criadoEm: new Date() });
  saveDB();
  return { liked: true };
}

function contarLikes(videoId) {
  return db.likes.filter(l => l.videoId === videoId).length;
}

function utilizadorDeuLike(videoId, userId) {
  return db.likes.some(l => l.videoId === videoId && l.userId === userId);
}

// ─── COMENTÁRIOS ──────────────────────────────────────────────────────────────

function criarComentario({ videoId, userId, texto }) {
  const c = { id: uuidv4(), videoId, userId, texto, estado: 'ativo', criadoEm: new Date() };
  db.comentarios.push(c);
  saveDB();
  return c;
}

function listarComentarios(videoId) {
  return db.comentarios
    .filter(c => c.videoId === videoId && c.estado === 'ativo')
    .map(c => {
      const autor = buscarUtilizadorPorId(c.userId);
      return { ...c, autorNome: autor?.nome || 'Desconhecido' };
    });
}

function removerComentario(id) {
  const c = db.comentarios.find(x => x.id === id);
  if (c) { c.estado = 'removido'; saveDB(); return true; }
  return false;
}

// ─── DENÚNCIAS ────────────────────────────────────────────────────────────────

const MOTIVOS_DENUNCIA = [
  'Conteúdo não autorizado',
  'Violação de direitos de autor',
  'Informação falsa',
  'Conteúdo ofensivo',
  'Conteúdo impróprio'
];

function criarDenuncia({ videoId, denuncianteId, motivo, descricao }) {
  const d = {
    id: uuidv4(), videoId, denuncianteId, motivo, descricao,
    estado: 'pendente',
    criadoEm: new Date()
  };
  db.denuncias.push(d);
  saveDB();
  return d;
}

function listarDenuncias({ estado } = {}) {
  return db.denuncias.filter(d => !estado || d.estado === estado);
}

function atualizarDenuncia(id, estado) {
  const d = db.denuncias.find(x => x.id === id);
  if (d) { d.estado = estado; d.resolvidoEm = new Date(); saveDB(); return true; }
  return false;
}

function contarDenunciasVideo(videoId) {
  return db.denuncias.filter(d => d.videoId === videoId).length;
}

// ─── CATEGORIAS ───────────────────────────────────────────────────────────────

function listarCategorias() { return db.categorias; }

function criarCategoria({ nome, icone }) {
  const c = { id: uuidv4(), nome, icone };
  db.categorias.push(c);
  saveDB();
  return c;
}

// ─── AUDITORIA ────────────────────────────────────────────────────────────────

function registarAuditoria({ adminId, acao, entidade, entidadeId, detalhe }) {
  db.auditoria.push({ id: uuidv4(), adminId, acao, entidade, entidadeId, detalhe, timestamp: new Date() });
  saveDB();
}

function listarAuditoria() { return db.auditoria; }

// ─── DASHBOARD (estatísticas) ─────────────────────────────────────────────────

function obterEstatisticas() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return {
    totalUtilizadores: db.users.length,
    utilizadoresSuspensos: db.users.filter(u => u.estado === 'suspenso').length,
    utilizadoresBloqueados: db.users.filter(u => u.estado === 'bloqueado').length,
    totalVideos: db.videos.filter(v => v.estado === 'ativo').length,
    videosRemovidosHoje: db.videos.filter(v => v.estado === 'removido' && new Date(v.criadoEm) >= hoje).length,
    denunciasPendentes: db.denuncias.filter(d => d.estado === 'pendente').length,
    videosHoje: db.videos.filter(v => new Date(v.criadoEm) >= hoje).length,
    videosMaisVistos: db.videos
      .filter(v => v.estado === 'ativo')
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map(v => ({ id: v.id, titulo: v.titulo, views: v.views }))
  };
}

module.exports = {
  criarUtilizador, buscarUtilizadorPorEmail, buscarUtilizadorPorId,
  listarUtilizadores, atualizarEstadoUtilizador,
  criarVideo, listarVideos, buscarVideoPorId, pesquisarVideos,
  incrementarViews, atualizarEstadoVideo,
  toggleLike, contarLikes, utilizadorDeuLike,
  criarComentario, listarComentarios, removerComentario,
  criarDenuncia, listarDenuncias, atualizarDenuncia, contarDenunciasVideo,
  MOTIVOS_DENUNCIA,
  listarCategorias, criarCategoria,
  registarAuditoria, listarAuditoria,
  obterEstatisticas
};
