// main entry point for the websocket server
// sets up express + vite middleware + socket.io
// serves the react client in dev via vite middleware, in prod from dist/

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupSocketHandlers } from './socket/handler.js';
import { gameManager } from './games/GameManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// port 3000 is reserved for other local projects — never default to it.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3131;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  setupSocketHandlers(io);

  // game factory will be wired up per-game as games are added.
  // left intentionally unset for now — games plug in component by component.
  void gameManager;

  if (process.env.NODE_ENV !== 'production') {
    // dev: use vite middleware so the react app is served with HMR.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: join(__dirname, '..'),
    });
    app.use(vite.middlewares);
  } else {
    // prod: serve the vite build output.
    const distPath = join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║           websocket server running                    ║
╠═══════════════════════════════════════════════════════╣
║  port: ${PORT.toString().padEnd(44)}║
║  cors: ${CORS_ORIGIN.padEnd(43)}║
╚═══════════════════════════════════════════════════════╝

open http://localhost:${PORT} on the host
phones join via the qr shown on the main screen
  `);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);
    httpServer.close(() => {
      console.log('server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('sigterm'));
  process.on('SIGINT', () => shutdown('sigint'));
}

startServer().catch((err) => {
  console.error('server failed to start:', err);
  process.exit(1);
});
