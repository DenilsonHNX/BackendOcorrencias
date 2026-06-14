# 📹 Plataforma de Ocorrências em Vídeo — Backend

**Grupo 10 | Projecto Final Multimédia 2026**

Backend RESTful com Node.js + Express. Suporta upload de vídeos, compressão automática com FFmpeg, streaming HLS e progressivo, sistema de denúncias e painel de administração completo.

---

## 📦 Instalação

```bash
npm install

# Instalar FFmpeg (obrigatório)
sudo apt install ffmpeg      # Linux
brew install ffmpeg          # macOS

cp .env.example .env
```

## ▶️ Executar

```bash
npm run dev    # desenvolvimento
npm start      # produção
```

---

## 🛣️ Endpoints

### Público
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/registar` | Criar conta |
| POST | `/api/auth/login` | Login → retorna JWT |
| GET  | `/api/videos` | Feed (paginado, filtrável) |
| GET  | `/api/videos/:id` | Detalhe do vídeo |
| GET  | `/api/stream/:id` | Streaming progressivo |
| GET  | `/api/categorias` | Listar categorias |

### Utilizador autenticado (🔒 JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/videos/upload` | Publicar vídeo |
| POST | `/api/videos/:id/like` | Like/Unlike |
| GET  | `/api/videos/:id/comentarios` | Ver comentários |
| POST | `/api/videos/:id/comentarios` | Comentar |
| POST | `/api/videos/:id/denunciar` | Denunciar vídeo |

### Admin (🔒 JWT + role admin)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET   | `/api/admin/dashboard` | Estatísticas gerais |
| GET   | `/api/admin/utilizadores` | Listar utilizadores |
| PATCH | `/api/admin/utilizadores/:id/estado` | Suspender/Bloquear |
| GET   | `/api/admin/videos` | Todos os vídeos |
| PATCH | `/api/admin/videos/:id/estado` | Ocultar/Remover |
| GET   | `/api/admin/denuncias` | Denúncias pendentes |
| PATCH | `/api/admin/denuncias/:id` | Resolver denúncia |
| GET   | `/api/admin/auditoria` | Log de acções |

---

## 🗂️ Estrutura

```
ocorrencias-backend/
├── src/
│   ├── server.js
│   ├── database.js
│   ├── middleware/
│   │   ├── auth.js       ← JWT + verificação de conta
│   │   └── upload.js     ← Multer (só vídeos)
│   ├── services/
│   │   └── ffmpeg.js     ← Compressão + HLS + Thumbnail
│   └── routes/
│       ├── auth.js
│       ├── videos.js     ← Feed, upload, like, comentário, denúncia
│       ├── stream.js     ← Range requests
│       ├── admin.js      ← Dashboard, moderação, auditoria
│       └── categorias.js
├── uploads/
│   ├── videos/
│   └── thumbnails/
├── hls/
├── .env.example
└── package.json
```
"# BackendOcorrencias" 
