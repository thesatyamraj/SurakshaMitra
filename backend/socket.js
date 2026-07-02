const { Server } = require('socket.io');
let io = null;

function initSocket(httpServer) {
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];

  io = new Server(httpServer, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

  io.on('connection', (socket) => {
    socket.on('join-slot',  (slot) => slot && socket.join(`slot:${slot}`));
    socket.on('leave-slot', (slot) => slot && socket.leave(`slot:${slot}`));
    socket.on('join-user',  (userId) => {
      if (userId && typeof userId === 'string' && userId.length === 24) socket.join(`user:${userId}`);
    });
    socket.on('join-area',  (area) => area && socket.join(`area:${String(area).toLowerCase().replace(/\s+/g,'-')}`));
    socket.on('join-admin', () => socket.join('admin_room'));
    socket.on('join-sos',   (token) => token && socket.join(`sos:${token}`));
    socket.on('leave-sos',  (token) => token && socket.leave(`sos:${token}`));
  });
  return io;
}

function getIO() { if (!io) throw new Error('Socket.io not initialised'); return io; }
module.exports = { initSocket, getIO };
