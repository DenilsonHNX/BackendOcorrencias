require('dotenv').config();
const express = require('express');
const https   = require('https');
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
app.use(verificarCertificado); // mTLS — bloqueia pedidos sem certificado válido da CA-ISPTEC
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ficheiros estáticos
app.use('/hls',      express.static(path.join(__dirname, '../hls')));
app.use('/uploads',  express.static(path.join(__dirname, '../uploads')));

// Rotas
app.use('/api/auth',       authRoutes);
app.use('/api/videos',     videosRoutes);
app.use('/api/stream',     streamRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/categorias', categoriasRoutes);

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

https.createServer(tlsOptions, app).listen(PORT, () => {
  console.log(`\n✅ Servidor HTTPS+mTLS iniciado na porta ${PORT}`);
  console.log(`📡 API:        https://localhost:${PORT}`);
  console.log(`🎬 Streaming:  https://localhost:${PORT}/api/stream/:id`);
  console.log(`🛡️  Admin:      https://localhost:${PORT}/api/admin/dashboard`);
  console.log(`🔒 mTLS:       certificado CA-ISPTEC obrigatório\n`);
});
