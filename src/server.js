require('dotenv').config();
const express = require('express');
const https   = require('https');
const http    = require('http');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const { verificarCertificado } = require('./middleware/mtls');

const authRoutes       = require('./routes/auth');
const videosRoutes     = require('./routes/videos');
const streamRoutes     = require('./routes/stream');
const adminRoutes      = require('./routes/admin');
const categoriasRoutes = require('./routes/categorias');
const liveRoutes       = require('./routes/live');
const { startTCPBroadcast } = require('./services/tcp-broadcast');

// Servidor TCP de broadcast (mesmo protocolo do servidor_broadcast.py)
const tcpBroadcast = startTCPBroadcast(9999);
global.__tcpBroadcast = tcpBroadcast; // acessível pelo live.js

const app  = express();
const PORT = process.env.PORT || 3000;

// Certificados TLS (mTLS)
const tlsOptions = {
  key:  fs.readFileSync(path.join(__dirname, '../certs/servidor.key')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/servidor.crt')),
  ca:   fs.readFileSync(path.join(__dirname, '../certs/ca.crt')),
  requestCert:       true,   // exige certificado de cliente
  rejectUnauthorized: false, // validação manual via middleware (permite resposta JSON)
};

// Criar pastas necessárias
['uploads/videos', 'uploads/thumbnails', 'hls'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ficheiros estáticos e stream — sem mTLS (player nativo não consegue apresentar certificado de cliente)
app.use('/hls',         express.static(path.join(__dirname, '../hls')));
app.use('/uploads',     express.static(path.join(__dirname, '../uploads')));
app.use('/api/stream',  streamRoutes);

// Rotas protegidas por mTLS
app.use('/api/auth',       verificarCertificado, authRoutes);
app.use('/api/videos',     verificarCertificado, videosRoutes);
app.use('/api/admin',      verificarCertificado, adminRoutes);
app.use('/api/categorias', verificarCertificado, categoriasRoutes);
// Live: start/stop via mTLS (admin), status público via media server
app.use('/api/live', verificarCertificado, liveRoutes);

// Rota raiz — lista todos os endpoints
app.get('/', (req, res) => {
  res.json({
    projeto: 'Plataforma de Ocorrências em Vídeo',
    grupo: 'Grupo 10',
    versao: '1.0.0',
    seguranca: {
      protocolo: 'HTTPS + mTLS',
      cliente: req.certInfo?.cn ?? '—',
      emissor: req.certInfo?.emissor ?? '—',
    },
    endpoints: {
      auth:       { registar: 'POST /api/auth/registar', login: 'POST /api/auth/login' },
      videos:     { feed: 'GET /api/videos', upload: 'POST /api/videos/upload', like: 'POST /api/videos/:id/like', denunciar: 'POST /api/videos/:id/denunciar' },
      stream:     { progressivo: 'GET /api/stream/:id' },
      categorias: { listar: 'GET /api/categorias' },
      admin:      { dashboard: 'GET /api/admin/dashboard', utilizadores: 'GET /api/admin/utilizadores', videos: 'GET /api/admin/videos', denuncias: 'GET /api/admin/denuncias' }
    }
  });
});

// Handler de erros global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Servidor HTTPS + mTLS para a API
https.createServer(tlsOptions, app).listen(PORT, () => {
  console.log(`\n✅ Servidor HTTPS+mTLS iniciado na porta ${PORT}`);
  console.log(`📡 API:        https://localhost:${PORT}`);
  console.log(`🛡️  Admin:      https://localhost:${PORT}/api/admin/dashboard`);
  console.log(`🔒 mTLS:       certificado CA-ISPTEC obrigatório`);
});

// Servidor HTTP para streaming de média (player nativo não suporta mTLS)
const MEDIA_PORT = process.env.MEDIA_PORT || 3001;
const mediaApp = express();
mediaApp.use(cors());
mediaApp.use(morgan('dev'));
mediaApp.use('/api/stream', streamRoutes);
mediaApp.use('/api/live',  liveRoutes);   // status público sem mTLS
mediaApp.use('/hls',        express.static(path.join(__dirname, '../hls')));
mediaApp.use('/uploads',    express.static(path.join(__dirname, '../uploads')));

http.createServer(mediaApp).listen(MEDIA_PORT, () => {
  console.log(`🎬 Streaming HTTP: http://localhost:${MEDIA_PORT}/api/stream/:id\n`);
});
