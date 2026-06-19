const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024; // 500MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/videos');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const mimePermitidos = [
    'video/mp4', 'video/mpeg', 'video/avi', 'video/mkv', 'video/mov',
    'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
    'video/3gpp', 'video/3gpp2', 'video/x-ms-wmv', 'video/ogg',
    'application/octet-stream', // alguns Android enviam assim
  ];
  const extPermitidas = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.3gp', '.3gpp', '.wmv', '.ogv', '.mpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeValido = mimePermitidos.includes(file.mimetype) || file.mimetype.startsWith('video/');
  const extValida = extPermitidas.includes(ext) || ext === '';

  if (mimeValido || extValida) {
    cb(null, true);
  } else {
    cb(new Error('Apenas ficheiros de vídeo são permitidos (mp4, avi, mkv, mov, webm).'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

module.exports = upload;
