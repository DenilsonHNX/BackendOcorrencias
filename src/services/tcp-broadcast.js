/**
 * Servidor TCP de broadcast de vídeo
 * Protocolo: igual ao servidor_broadcast.py da aula
 *
 * - STREAMER envia: role(16 bytes) + [4 bytes tamanho + N bytes JPEG]*
 * - VIEWER  envia: role(16 bytes)  e recebe os mesmos pacotes
 */
const net = require('net');

let streamerSocket = null;
let viewers        = [];
let broadcastInfo  = null;

function readU32BE(buf, offset = 0) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) |
          (buf[offset + 2] << 8)  |  buf[offset + 3]) >>> 0;
}

function packU32BE(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function broadcastFrame(frameData) {
  const packet = Buffer.concat([packU32BE(frameData.length), frameData]);
  const dead = [];
  for (const v of viewers) {
    try { v.write(packet); } catch { dead.push(v); }
  }
  if (dead.length) viewers = viewers.filter(v => !dead.includes(v));
}

function handleStreamer(socket, initialData) {
  if (streamerSocket) { socket.destroy(); return; }

  streamerSocket = socket;
  broadcastInfo  = { iniciadoEm: new Date().toISOString() };
  console.log('[TCP] Streamer conectado');

  let buf = initialData.length ? initialData : Buffer.alloc(0);

  socket.on('data', data => {
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const sz = readU32BE(buf);
      if (buf.length < 4 + sz) break;
      broadcastFrame(buf.slice(4, 4 + sz));
      buf = buf.slice(4 + sz);
    }
  });

  socket.on('close', () => {
    streamerSocket = null;
    broadcastInfo  = null;
    console.log('[TCP] Streamer desconectado');
  });

  socket.on('error', () => {});
}

function handleViewer(socket) {
  viewers.push(socket);
  console.log(`[TCP] Viewer conectado (total: ${viewers.length})`);
  socket.on('close', () => { viewers = viewers.filter(v => v !== socket); });
  socket.on('error', () => {});
}

function startTCPBroadcast(port = 9999) {
  const server = net.createServer(socket => {
    let roleBuf     = Buffer.alloc(0);
    let roleHandled = false;

    socket.on('data', data => {
      if (roleHandled) return;
      roleBuf = Buffer.concat([roleBuf, data]);
      if (roleBuf.length < 16) return;

      roleHandled  = true;
      const role   = roleBuf.slice(0, 16).toString('utf8').trim();
      const rest   = roleBuf.slice(16);

      if      (role === 'STREAMER') handleStreamer(socket, rest);
      else if (role === 'VIEWER')   handleViewer(socket);
      else                          socket.destroy();
    });

    socket.on('error', () => {});
  });

  server.listen(port, () => console.log(`📡 TCP Broadcast: porta ${port}`));

  return {
    isLive:      () => streamerSocket !== null,
    getInfo:     () => broadcastInfo,
    viewerCount: () => viewers.length,
  };
}

module.exports = { startTCPBroadcast };
