# Websocket Server

a real-time multiplayer websocket server designed for card and board games. this server handles all the networking layer 

- game rooms
- player connections
- event broadcasting
while keeping your game logic completely separate.

## Setup

```bash
npm install
npm run dev
```

server runs at `http://localhost:3131`. on the same network, phones can join via `http://<your-lan-ip>:3131`.

override the port with `PORT=<n>` if needed (don't use 3000).
