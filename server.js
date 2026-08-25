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

/*
rooms = {
  nomeDaSala: {
    broadcasterId: 'socket-id',
    watchers: Set()
  }
}
*/

const rooms = new Map();

function getRoom(roomId) {
  return rooms.get(roomId);
}

function createRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      broadcasterId: null,
      watchers: new Set()
    });
  }

  return rooms.get(roomId);
}

function removeRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);

  if (!room) return;

  if (
    !room.broadcasterId &&
    room.watchers.size === 0
  ) {
    rooms.delete(roomId);
  }
}

/*
Endpoint interno para obter as credenciais TURN.

A chave do Metered fica SOMENTE no Render:

METERED_API_KEY=sua_nova_chave
*/

app.get('/api/turn-credentials', async (req, res) => {
  try {
    const apiKey = process.env.METERED_API_KEY;

    if (!apiKey) {
      console.error(
        '[TURN] METERED_API_KEY não configurada'
      );

      return res.status(500).json({
        error: 'Servidor TURN não configurado'
      });
    }

    const url =
      `https://makai.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Metered respondeu HTTP ${response.status}`
      );
    }

    const iceServers = await response.json();

    console.log(
      `[TURN] Credenciais entregues. ${iceServers.length} servidores ICE.`
    );

    res.set('Cache-Control', 'no-store');

    res.json(iceServers);

  } catch (error) {

    console.error(
      '[TURN] Erro ao buscar credenciais:',
      error.message
    );

    res.status(500).json({
      error: 'Não foi possível obter credenciais TURN'
    });

  }
});


io.on('connection', (socket) => {

  console.log(
    `[SOCKET] Conectado: ${socket.id}`
  );


  /*
  TRANSMISSOR
  */

  socket.on('broadcaster', (roomId) => {

    if (!roomId) return;

    const room = createRoom(roomId);

    /*
    Se houver outro broadcaster na sala,
    substitui pelo atual.
    */

    if (
      room.broadcasterId &&
      room.broadcasterId !== socket.id
    ) {
      console.log(
        `[ROOM] Broadcaster substituído na sala ${roomId}`
      );
    }

    room.broadcasterId = socket.id;

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = 'broadcaster';

    console.log(
      `[BROADCASTER] ${socket.id} iniciou na sala ${roomId}`
    );

    /*
    Avisa espectadores que já estavam aguardando.
    */

    socket.to(roomId).emit(
      'broadcaster-ready'
    );

    /*
    Também notifica o broadcaster sobre
    watchers que entraram antes dele.
    */

    for (const watcherId of room.watchers) {

      if (watcherId !== socket.id) {

        io.to(socket.id).emit(
          'watcher',
          watcherId
        );

      }

    }

  });


  /*
  BROADCASTER PAROU A TRANSMISSÃO
  */

  socket.on('broadcaster-stop', (roomId) => {

    const room = getRoom(roomId);

    if (!room) return;

    if (room.broadcasterId === socket.id) {

      room.broadcasterId = null;

      console.log(
        `[BROADCASTER] Parou transmissão na sala ${roomId}`
      );

      socket.to(roomId).emit(
        'broadcaster-disconnect'
      );

      removeRoomIfEmpty(roomId);

    }

  });


  /*
  ESPECTADOR
  */

  socket.on('watcher', (roomId) => {

    if (!roomId) return;

    const room = createRoom(roomId);

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = 'watcher';

    room.watchers.add(socket.id);

    console.log(
      `[WATCHER] ${socket.id} entrou na sala ${roomId}`
    );

    const broadcasterId = room.broadcasterId;

    if (!broadcasterId) {

      console.log(
        `[WATCHER] Nenhum transmissor na sala ${roomId}`
      );

      socket.emit(
        'no-broadcaster'
      );

      return;
    }

    console.log(
      `[WATCHER] Notificando broadcaster ${broadcasterId}`
    );

    io.to(broadcasterId).emit(
      'watcher',
      socket.id
    );

  });


  /*
  WEBRTC OFFER
  */

  socket.on('offer', (targetId, offer) => {

    console.log(
      `[OFFER] ${socket.id} -> ${targetId}`
    );

    io.to(targetId).emit(
      'offer',
      socket.id,
      offer
    );

  });


  /*
  WEBRTC ANSWER
  */

  socket.on('answer', (targetId, answer) => {

    console.log(
      `[ANSWER] ${socket.id} -> ${targetId}`
    );

    io.to(targetId).emit(
      'answer',
      socket.id,
      answer
    );

  });


  /*
  ICE CANDIDATE
  */

  socket.on('candidate', (targetId, candidate) => {

    if (!candidate) return;

    io.to(targetId).emit(
      'candidate',
      socket.id,
      candidate
    );

  });


  /*
  ESPECTADOR DESCONECTOU
  */

  socket.on('disconnect', () => {

    console.log(
      `[SOCKET] Desconectado: ${socket.id}`
    );

    const roomId = socket.roomId;

    if (!roomId) return;

    const room = getRoom(roomId);

    if (!room) return;


    /*
    BROADCASTER DESCONECTOU
    */

    if (
      socket.role === 'broadcaster' &&
      room.broadcasterId === socket.id
    ) {

      room.broadcasterId = null;

      socket.to(roomId).emit(
        'broadcaster-disconnect'
      );

      console.log(
        `[BROADCASTER] Desconectou da sala ${roomId}`
      );

    }


    /*
    WATCHER DESCONECTOU
    */

    if (socket.role === 'watcher') {

      room.watchers.delete(socket.id);

      if (room.broadcasterId) {

        io.to(room.broadcasterId).emit(
          'disconnectPeer',
          socket.id
        );

      }

      console.log(
        `[WATCHER] Saiu da sala ${roomId}`
      );

    }

    removeRoomIfEmpty(roomId);

  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    `Servidor rodando na porta ${PORT}`
  );

});
