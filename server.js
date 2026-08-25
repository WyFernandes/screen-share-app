const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// TURN / METERED
// ============================================================

app.get('/api/turn-credentials', async (req, res) => {
  try {
    const apiKey = process.env.METERED_TURN_API_KEY;

    if (!apiKey) {
      console.error('METERED_TURN_API_KEY não configurada no Render.');
      return res.status(500).json({
        error: 'METERED_TURN_API_KEY não configurada.'
      });
    }

    const url =
      `https://makai.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();

      console.error(
        `Metered respondeu ${response.status}:`,
        text
      );

      return res.status(response.status).json({
        error: 'Metered recusou a solicitação de credenciais TURN.',
        status: response.status
      });
    }

    const iceServers = await response.json();

    console.log('Credenciais TURN obtidas com sucesso.');

    res.json(iceServers);

  } catch (error) {
    console.error('Erro ao obter credenciais TURN:', error);

    res.status(500).json({
      error: 'Erro interno ao obter credenciais TURN.'
    });
  }
});

// ============================================================
// SALAS
// ============================================================

// rooms[roomId] = socketId do broadcaster
const rooms = {};

// ============================================================
// SOCKET.IO
// ============================================================

io.on('connection', (socket) => {

  console.log(`Socket conectado: ${socket.id}`);

  // ----------------------------------------------------------
  // BROADCASTER
  // ----------------------------------------------------------

  socket.on('broadcaster', (roomId) => {

    if (!roomId) return;

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = 'broadcaster';

    rooms[roomId] = socket.id;

    console.log(
      `Broadcaster ${socket.id} iniciou transmissão na sala ${roomId}`
    );

    // Avisar viewers que estavam esperando
    socket.to(roomId).emit('broadcaster-ready');
  });

  // ----------------------------------------------------------
  // VIEWER
  // ----------------------------------------------------------

  socket.on('watcher', (roomId) => {

    if (!roomId) return;

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = 'watcher';

    const broadcasterId = rooms[roomId];

    if (broadcasterId) {

      console.log(
        `Viewer ${socket.id} entrou na sala ${roomId}`
      );

      io.to(broadcasterId).emit(
        'watcher',
        socket.id
      );

    } else {

      console.log(
        `Viewer ${socket.id} aguardando broadcaster na sala ${roomId}`
      );

      socket.emit('no-broadcaster');
    }
  });

  // ----------------------------------------------------------
  // WEBRTC OFFER
  // ----------------------------------------------------------

  socket.on('offer', (targetId, message) => {

    if (!targetId || !message) return;

    io.to(targetId).emit(
      'offer',
      socket.id,
      message
    );
  });

  // ----------------------------------------------------------
  // WEBRTC ANSWER
  // ----------------------------------------------------------

  socket.on('answer', (targetId, message) => {

    if (!targetId || !message) return;

    io.to(targetId).emit(
      'answer',
      socket.id,
      message
    );
  });

  // ----------------------------------------------------------
  // ICE CANDIDATE
  // ----------------------------------------------------------

  socket.on('candidate', (targetId, message) => {

    if (!targetId || !message) return;

    io.to(targetId).emit(
      'candidate',
      socket.id,
      message
    );
  });

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------

  socket.on('disconnect', () => {

    console.log(`Socket desconectado: ${socket.id}`);

    // Broadcaster
    if (
      socket.role === 'broadcaster' &&
      socket.roomId
    ) {

      // Só remove se ainda for o broadcaster atual
      if (rooms[socket.roomId] === socket.id) {
        delete rooms[socket.roomId];
      }

      socket
        .to(socket.roomId)
        .emit('broadcaster-disconnect');

      console.log(
        `Broadcaster da sala ${socket.roomId} desconectou`
      );

      return;
    }

    // Viewer
    if (
      socket.role === 'watcher' &&
      socket.roomId
    ) {

      const broadcasterId =
        rooms[socket.roomId];

      if (broadcasterId) {

        io.to(broadcasterId).emit(
          'disconnectPeer',
          socket.id
        );
      }
    }
  });
});

// ============================================================
// SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `Servidor rodando na porta ${PORT}`
  );
});
