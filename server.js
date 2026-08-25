const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Guarda qual socket é o transmissor de cada sala
// rooms[roomId] = broadcasterSocketId
const rooms = {};

io.on('connection', (socket) => {
  // O transmissor anuncia que vai transmitir em uma sala
  socket.on('broadcaster', (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'broadcaster';
    rooms[roomId] = socket.id;
    console.log(`Transmissor conectado na sala ${roomId}`);
  });

  // Um espectador entra na sala e pede para assistir
  socket.on('watcher', (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.role = 'watcher';

    const broadcasterId = rooms[roomId];
    if (broadcasterId) {
      // avisa o transmissor que tem um novo espectador (pelo id do socket)
      io.to(broadcasterId).emit('watcher', socket.id);
    } else {
      socket.emit('no-broadcaster');
    }
  });

  // Repasse das mensagens de sinalização WebRTC (offer/answer/candidate)
  socket.on('offer', (targetId, message) => {
    io.to(targetId).emit('offer', socket.id, message);
  });

  socket.on('answer', (targetId, message) => {
    io.to(targetId).emit('answer', socket.id, message);
  });

  socket.on('candidate', (targetId, message) => {
    io.to(targetId).emit('candidate', socket.id, message);
  });

  socket.on('disconnect', () => {
    if (socket.role === 'broadcaster' && socket.roomId) {
      delete rooms[socket.roomId];
      socket.to(socket.roomId).emit('broadcaster-disconnect');
      console.log(`Transmissor da sala ${socket.roomId} desconectou`);
    } else if (socket.role === 'watcher' && socket.roomId) {
      const broadcasterId = rooms[socket.roomId];
      if (broadcasterId) {
        io.to(broadcasterId).emit('disconnectPeer', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
