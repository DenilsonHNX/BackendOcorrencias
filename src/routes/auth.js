const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database');
const { gerarToken, verificarToken } = require('../middleware/auth');

// POST /api/auth/registar
router.post('/registar', async (req, res) => {
  try {
    const { nome, email, password } = req.body;
    if (!nome || !email || !password)
      return res.status(400).json({ error: 'Nome, email e password são obrigatórios.' });

    if (db.buscarUtilizadorPorEmail(email))
      return res.status(409).json({ error: 'Já existe uma conta com este email.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = db.criarUtilizador({ nome, email, passwordHash });
    const token = gerarToken(user);

    res.status(201).json({
      message: 'Conta criada com sucesso!',
      token,
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email e password são obrigatórios.' });

    const user = db.buscarUtilizadorPorEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (user.estado !== 'ativo')
      return res.status(403).json({ error: `Conta ${user.estado}. Contacte o suporte.` });

    const token = gerarToken(user);
    res.json({
      message: 'Login realizado com sucesso!',
      token,
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/perfil
router.get('/perfil', verificarToken, (req, res) => {
  const user = db.buscarUtilizadorPorId(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
  res.json({ id: user.id, nome: user.nome, email: user.email, role: user.role, estado: user.estado });
});

module.exports = router;
