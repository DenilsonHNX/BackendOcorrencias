# OcorrênciasApp — Servidor (Backend)

API RESTful em Node.js com streaming de vídeo, compressão H.264 via FFmpeg e segurança mTLS.

---

## Requisitos

- [Node.js](https://nodejs.org/) 18.x ou superior
- [FFmpeg](https://ffmpeg.org/) instalado e disponível no PATH

Verificar instalações:
```bash
node --version
ffmpeg -version
```

---

## Instalação

```bash
git clone https://github.com/DenilsonHNX/BackendOcorrencias.git
cd BackendOcorrencias
npm install
```

---

## Configuração

### Endereço IP

Editar `src/server.js` e substituir o IP pelo IP da máquina na rede local. A app Flutter usa este IP para as ligações.

### Certificados mTLS

Os certificados estão em `certs/`. Para regenerar:

```bash
# CA privada
openssl genrsa -out certs/ca.key 2048
openssl req -new -x509 -days 3650 -key certs/ca.key -out certs/ca.crt -subj "/CN=OcorrenciasCA"

# Certificado do servidor
openssl genrsa -out certs/servidor.key 2048
openssl req -new -key certs/servidor.key -out certs/servidor.csr -subj "/CN=servidor.ocorrencias"
openssl x509 -req -days 3650 -in certs/servidor.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/servidor.crt

# Certificado do cliente (app mobile)
openssl genrsa -out certs/app.key 2048
openssl req -new -key certs/app.key -out certs/app.csr -subj "/CN=app.ocorrencias"
openssl x509 -req -days 3650 -in certs/app.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/app.crt
```

---

## Executar

```bash
npm start
```

Dois serviços arrancam:
- **API REST (mTLS)** — `https://0.0.0.0:3000`
- **Streaming VOD (HTTP)** — `http://0.0.0.0:3001`

---

## Estrutura

```
Backend/
├── certs/           # Certificados PKI (CA, servidor, cliente)
├── data/
│   └── db.json      # Base de dados (persistência JSON)
├── src/
│   ├── routes/      # auth, videos, admin, categorias, stream
│   ├── middleware/  # JWT, mTLS, roles
│   ├── services/
│   │   └── ffmpeg.js   # Compressão H.264 + thumbnail
│   ├── database.js
│   └── server.js
├── uploads/
│   ├── videos/      # Originais + *_compressed.mp4
│   └── thumbnails/  # Gerados automaticamente
└── hls/             # Segmentos HLS (gerados automaticamente)
```

---

## Endpoints Principais

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/register` | — | Registo |
| POST | `/api/auth/login` | — | Login → JWT |
| GET | `/api/videos` | opcional | Feed de vídeos |
| POST | `/api/videos` | JWT | Upload de vídeo |
| GET | `/api/stream/:id` | mTLS | Streaming do vídeo |
| GET | `/api/admin/dashboard` | JWT+admin | Estatísticas |
| GET | `/api/admin/utilizadores` | JWT+admin | Listar utilizadores |
| POST | `/api/admin/utilizadores` | JWT+admin | Criar utilizador |
| PATCH | `/api/admin/utilizadores/:id/estado` | JWT+admin | Suspender/Bloquear |
| GET | `/api/admin/videos` | JWT+admin | Listar vídeos |
| PATCH | `/api/admin/videos/:id/estado` | JWT+admin | Ocultar/Remover |
| GET | `/api/admin/denuncias` | JWT+admin | Listar denúncias |
| PATCH | `/api/admin/denuncias/:id` | JWT+admin | Resolver denúncia |
| GET | `/api/admin/auditoria` | JWT+admin | Logs de auditoria |

---

## Conta de Administrador Padrão

- **Email:** `admin@ocorrencias.ao`
- **Password:** `Admin@2026`

---

## Compressão de Vídeo

FFmpeg é invocado automaticamente após cada upload:

```
Codec:    libx264 (H.264)   CRF: 28   Preset: medium
Escala:   máximo 720p       Áudio: AAC 128 kbps
```

Resultados medidos com vídeos reais:

| Vídeo | Original | Comprimido | Redução |
|---|---|---|---|
| 6s | 6.62 MB | 683 KB | 89,9% |
| 3s | 3.38 MB | 596 KB | 82,8% |
| 12s | 12.87 MB | 2.53 MB | 80,4% |
| **Média** | — | — | **84,4%** |
