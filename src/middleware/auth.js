const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'ocorrencias_secret_2026';

function gerarToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verifica se tem token válido
function verificarToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    req.user = decoded;
    next();
  });
}

// Verifica se é admin
function apenasAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

// Verifica se conta está activa (não suspensa/bloqueada)
function contaActiva(req, res, next) {
  const db = require('../database');
  const user = db.buscarUtilizadorPorId(req.user.id);
  if (!user || user.estado !== 'ativo') {
    return res.status(403).json({ error: `Conta ${user?.estado || 'inválida'}. Contacte o suporte.` });
  }
  next();
}

module.exports = { gerarToken, verificarToken, apenasAdmin, contaActiva };
