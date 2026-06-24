/**
 * Servidor TCP de broadcast multi-canal
 * Protocolo (16 bytes de role):
 *   byte 0    : 'S' (STREAMER) ou 'V' (VIEWER)
 *   bytes 1-15: channelId, space-padded
 *
 * Após o role: [4 bytes big-endian tamanho + N bytes payload MP4] *
 */
const net = require('net');

// Map<channelId, { socket, iniciadoEm }>
const streamers = new Map();
// Map<channelId, Set<socket>>
const viewers   = new Map();

function readU32BE(buf, offset = 0) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) |
          (buf[offset + 2] << 8)  |  buf[offset + 3]) >>> 0;
}

function packU32BE(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function broadcastFrame(channelId, frameData) {
  const vSet = viewers.get(channelId);
  if (!vSet || vSet.size === 0) return;
  const packet = Buffer.concat([packU32BE(frameData.length), frameData]);
  const dead = [];
  for (const v of vSet) {
    try { v.write(packet); } catch { dead.push(v); }
  }
  dead.forEach(v => vSet.delete(v));
}

function handleStreamer(socket, channelId, initialData) {
  // Se já existia streamer no canal, desligar o antigo
  if (streamers.has(channelId)) {
    try { streamers.get(channelId).socket.destroy(); } catch {}
  }
  streamers.set(channelId, { socket, iniciadoEm: new Date().toISOString() });
  if (!viewers.has(channelId)) viewers.set(channelId, new Set());
  console.log(`[TCP] Streamer "${channelId}" conectado (total: ${streamers.size})`);

  let buf = initialData.length ? initialData : Buffer.alloc(0);

  socket.on('data', data => {
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const sz = readU32BE(buf);
      if (buf.length < 4 + sz) break;
      broadcastFrame(channelId, buf.slice(4, 4 + sz));
      buf = buf.slice(4 + sz);
    }
  });

  socket.on('close', () => {
    streamers.delete(channelId);
    console.log(`[TCP] Streamer "${channelId}" desconectado (restam: ${streamers.size})`);
  });

  socket.on('error', () => {});
}

function handleViewer(socket, channelId) {
  if (!viewers.has(channelId)) viewers.set(channelId, new Set());
  viewers.get(channelId).add(socket);
  console.log(`[TCP] Viewer entrou no canal "${channelId}" (total: ${viewers.get(channelId).size})`);

  socket.on('close', () => {
    viewers.get(channelId)?.delete(socket);
  });
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

      roleHandled      = true;
      const type       = String.fromCharCode(roleBuf[0]);
      const channelId  = roleBuf.slice(1, 16).toString('utf8').trim() || 'default';
      const rest       = roleBuf.slice(16);

      if      (type === 'S') handleStreamer(socket, channelId, rest);
      else if (type === 'V') handleViewer(socket, channelId);
      else                   socket.destroy();
    });

    socket.on('error', () => {});
  });

  server.listen(port, () => console.log(`📡 TCP Broadcast multi-canal: porta ${port}`));

  return {
    isLive:      () => streamers.size > 0,
    getStreams:  () => [...streamers.entries()].map(([channelId, s]) => ({
      channelId,
      iniciadoEm:  s.iniciadoEm,
      viewers:     viewers.get(channelId)?.size ?? 0,
    })),
    viewerCount: () => [...viewers.values()].reduce((acc, s) => acc + s.size, 0),
  };
}

module.exports = { startTCPBroadcast };
