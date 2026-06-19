const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../database');

// GET /api/stream/:id — Streaming progressivo com Range Requests
router.get('/:id', (req, res) => {
  const video = db.buscarVideoPorId(req.params.id);
  if (!video || video.estado === 'removido')
    return res.status(404).json({ error: 'Vídeo não encontrado.' });

  const filePath = path.resolve(video.ficheiro);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: 'Ficheiro não encontrado no servidor.' });

  const fileSize = fs.statSync(filePath).size;
  const range = req.headers.range;

  if (range) {
    // Streaming parcial — suporta seek (avançar/retroceder na barra de progresso)
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4'
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    // Stream completo
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
