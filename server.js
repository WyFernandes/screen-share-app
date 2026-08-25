const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

/*
  ============================================================
  METERED TURN
  ============================================================

  No Render:

  METERED_API_KEY = sua nova chave

  Não coloque a chave no HTML.
*/

const METERED_API_KEY = process.env.METERED_API_KEY;
const METERED_DOMAIN =
  process.env.METERED_DOMAIN || "makai.metered.live";

app.get("/api/turn-credentials", async (req, res) => {
  if (!METERED_API_KEY) {
    console.error("METERED_API_KEY não configurada.");
    return res.status(500).json({
      error: "METERED_API_KEY não configurada no servidor."
    });
  }

  try {
    const url =
      `https://${METERED_DOMAIN}/api/v1/turn/credentials` +
      `?apiKey=${encodeURIComponent(METERED_API_KEY)}`;

    console.log("Solicitando credenciais TURN ao Metered...");

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();

      console.error(
        "Metered respondeu com erro:",
        response.status,
        text
      );

      return res.status(502).json({
        error: "Metered recusou a solicitação de credenciais TURN.",
        status: response.status
      });
    }

    const credentials = await response.json();

    console.log("Credenciais TURN obtidas com sucesso.");

    return res.json(credentials);

  } catch (error) {
    console.error("Erro ao obter TURN:", error);

    return res.status(500).json({
      error: "Falha ao obter credenciais TURN."
    });
  }
});

/*
  ============================================================
  SOCKET.IO
  ============================================================
*/

io.on("connection", (socket) => {

  console.log("Socket conectado:", socket.id);

  /*
    ----------------------------------------------------------
    BROADCASTER
    ----------------------------------------------------------
  */

  socket.on("broadcaster", (roomId) => {

    roomId = String(roomId || "").trim();

    if (!roomId) {
      return;
    }

    /*
      Se já havia outro broadcaster nessa sala,
      desconecta a referência antiga.
    */

    const oldBroadcaster = rooms.get(roomId);

    if (oldBroadcaster && oldBroadcaster !== socket.id) {
      console.log(
        `Substituindo broadcaster da sala ${roomId}`
      );

      io.to(oldBroadcaster).emit("broadcaster-replaced");
    }

    rooms.set(roomId, socket.id);

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = "broadcaster";

    console.log(
      `Broadcaster ${socket.id} transmitindo na sala ${roomId}`
    );

    /*
      Avisa espectadores que já estavam esperando.
    */

    socket.to(roomId).emit("broadcaster-ready");
  });


  /*
    ----------------------------------------------------------
    WATCHER
    ----------------------------------------------------------
  */

  socket.on("watcher", (roomId) => {

    roomId = String(roomId || "").trim();

    if (!roomId) {
      return;
    }

    socket.join(roomId);

    socket.roomId = roomId;
    socket.role = "watcher";

    const broadcasterId = rooms.get(roomId);

    console.log(
      `Watcher ${socket.id} entrou na sala ${roomId}`
    );

    if (!broadcasterId) {

      console.log(
        `Nenhum broadcaster encontrado para ${roomId}`
      );

      socket.emit("no-broadcaster");

      return;
    }

    console.log(
      `Solicitando oferta ao broadcaster ${broadcasterId}`
    );

    io.to(broadcasterId).emit(
      "watcher",
      socket.id
    );
  });


  /*
    ----------------------------------------------------------
    OFFER
    ----------------------------------------------------------
  */

  socket.on("offer", (targetId, message) => {

    console.log(
      `Offer: ${socket.id} -> ${targetId}`
    );

    io.to(targetId).emit(
      "offer",
      socket.id,
      message
    );
  });


  /*
    ----------------------------------------------------------
    ANSWER
    ----------------------------------------------------------
  */

  socket.on("answer", (targetId, message) => {

    console.log(
      `Answer: ${socket.id} -> ${targetId}`
    );

    io.to(targetId).emit(
      "answer",
      socket.id,
      message
    );
  });


  /*
    ----------------------------------------------------------
    ICE CANDIDATE
    ----------------------------------------------------------
  */

  socket.on("candidate", (targetId, message) => {

    io.to(targetId).emit(
      "candidate",
      socket.id,
      message
    );
  });


  /*
    ----------------------------------------------------------
    DISCONNECT
    ----------------------------------------------------------
  */

  socket.on("disconnect", () => {

    console.log(
      "Socket desconectado:",
      socket.id
    );

    if (!socket.roomId) {
      return;
    }

    const roomId = socket.roomId;

    /*
      BROADCASTER
    */

    if (socket.role === "broadcaster") {

      if (rooms.get(roomId) === socket.id) {
        rooms.delete(roomId);
      }

      socket.to(roomId).emit(
        "broadcaster-disconnect"
      );

      console.log(
        `Broadcaster saiu da sala ${roomId}`
      );

      return;
    }


    /*
      WATCHER
    */

    if (socket.role === "watcher") {

      const broadcasterId = rooms.get(roomId);

      if (broadcasterId) {

        io.to(broadcasterId).emit(
          "disconnectPeer",
          socket.id
        );
      }
    }
  });
});


/*
  ============================================================
  SERVER
  ============================================================
*/

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Servidor rodando na porta ${PORT}`
  );

});
