const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/categorias — Listar todas as categorias (público)
router.get('/', (req, res) => {
  res.json(db.listarCategorias());
});

module.exports = router;
