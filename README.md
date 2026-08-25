# Transmissão de Tela (WebRTC P2P)

App simples para transmitir a tela do seu computador ao vivo para até ~10 espectadores,
usando WebRTC direto entre navegadores (baixa latência, sem servidor de vídeo pesado).

## Como funciona

- Você acessa `/broadcaster.html?room=SEUCODIGO` e clica em "Iniciar transmissão".
- O navegador pede qual tela/janela compartilhar.
- Cada espectador acessa `/viewer.html?room=SEUCODIGO` e assiste em tempo real.
- Um pequeno servidor (Node.js + Socket.io) só serve para os navegadores se
  "apresentarem" um ao outro (sinalização). O vídeo em si viaja direto entre os
  computadores (peer-to-peer), sem passar pelo servidor.

## Rodando localmente (para testar)

Pré-requisito: [Node.js](https://nodejs.org) instalado.

```bash
cd screen-share-app
npm install
npm start
```

Acesse `http://localhost:3000` no navegador. Isso abre a tela inicial onde você
digita um código de sala e escolhe "Transmitir" ou "Assistir".

**Importante:** para transmitir/assistir de outros computadores (não só o localhost),
o site precisa estar publicado na internet (veja abaixo) — em `localhost` só funciona
no próprio computador.

## Publicando de graça na internet (para outras pessoas acessarem por um link)

A forma mais fácil é usar o **Render.com** (tem plano gratuito):

1. Crie uma conta em https://render.com
2. Suba esta pasta para um repositório no GitHub (ou use o "upload direto" do Render).
3. No Render, clique em "New +" → "Web Service", conecte o repositório.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Clique em "Deploy". Em alguns minutos você recebe uma URL pública, tipo
   `https://sua-transmissao.onrender.com`.
6. Compartilhe: `https://sua-transmissao.onrender.com/viewer.html?room=SEUCODIGO`

Alternativas equivalentes: **Railway.app**, **Fly.io**, ou uma VPS simples (o app
não precisa de banco de dados nem de nada especial, só rodar `node server.js`).

## Limitações importantes

- **HTTPS é obrigatório** para captura de tela (`getDisplayMedia`) funcionar fora do
  localhost. Serviços como Render/Railway já fornecem HTTPS automaticamente.
- Este modelo é **P2P (mesh)**: o computador que transmite envia uma cópia do vídeo
  para cada espectador. Funciona bem até ~10 pessoas; para audiências maiores seria
  necessário um servidor de mídia (SFU) — posso montar isso depois se precisar escalar.
- Em redes corporativas com firewall muito restritivo, pode ser necessário um
  servidor TURN (ex: serviço gratuito do Metered.ca ou Twilio) além do STUN já
  incluído. Se algum espectador não conseguir conectar, isso costuma ser a causa.
- Áudio do sistema (ex: som do computador) só é compartilhado se o navegador/SO
  suportar e o usuário marcar a opção ao escolher a tela (funciona bem no Chrome/Edge
  no Windows; no Mac o áudio do sistema tem mais restrições).

## Estrutura dos arquivos

```
screen-share-app/
├── server.js           # servidor de sinalização (Node + Socket.io)
├── package.json
└── public/
    ├── index.html       # tela inicial (criar/entrar em sala)
    ├── broadcaster.html # quem transmite a tela
    └── viewer.html      # quem assiste
```
