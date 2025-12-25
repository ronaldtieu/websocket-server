// main entry point for the websocket server
// sets up the http server and socket.io
// starts listening for connections

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupSocketHandlers } from './socket/handler.js';
import { gameManager } from './games/GameManager.js';
import { ArchdukeGame } from './games/archduke/src/ArchdukeGame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// port to run the server on
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// controls which websites can connect
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// creates an http server
const httpServer = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = join(__dirname, '../public/test-client.html');
    try {
      const content = readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('test client not found');
    }
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

// creates the socket.io server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// sets up the archduke game
gameManager.setGameFactory((gameId: string) => {
  return new ArchdukeGame(gameId);
});

console.log('archduke game connected. ready for testing');

// sets up all socket event listeners
setupSocketHandlers(io);

// starts listening for connections on the configured port
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║           websocket server running                    ║
╠═══════════════════════════════════════════════════════╣
║  port: ${PORT.toString().padEnd(44)}║
║  cors: ${CORS_ORIGIN.padEnd(43)}║
╚═══════════════════════════════════════════════════════╝

waiting for connections...
  `);
});

// handles shutdown signals (ctrl+c, deployment restarts, etc)
// closes connections cleanly before exiting

// sigterm is sent by deployment systems
process.on('SIGTERM', () => {
  console.log('sigterm received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('server closed');
    process.exit(0);
  });
});

// sigint is sent when pressing ctrl+c
process.on('SIGINT', () => {
  console.log('sigint received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('server closed');
    process.exit(0);
  });
});

export { io, gameManager };
