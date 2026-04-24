// socket event handlers for the lobby + game-routing layer.
// events follow the vocabulary the react client expects (see src/client/App.tsx).
// games plug in via the GameInterface contract (src/games/GameInterface.ts).

import os from 'os';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { gameManager } from '../games/GameManager.js';
import type { GameInterface, PlayerAction } from '../games/GameInterface.js';
import { getGameRegistration } from '../games/registry.js';
import { DEFAULT_DIFFICULTY, type Difficulty } from '../games/cpu/difficulty.js';
// side-effect import: loading this barrel registers every game with the
// server registry. do not remove.
import '../games/index.js';

interface Player {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isCpu: boolean;
}

const CPU_NAMES = ['ORBIT', 'CIRCUIT', 'NEON', 'PULSE', 'VECTOR', 'ZEPHYR', 'GLITCH', 'RELAY'];
let cpuCounter = 0;

interface LobbyState {
  code: string;
  players: Player[];
  selectedGameId: string | null;
  testMode: boolean;
  started: boolean;
  activeGame: GameInterface | null;
  cpuDifficulty: Difficulty;
}

const lobby: LobbyState = {
  code: generateCode(),
  players: [],
  selectedGameId: null,
  testMode: true,
  started: false,
  activeGame: null,
  cpuDifficulty: DEFAULT_DIFFICULTY,
};

// when a game reaches the 'finished' phase, schedule an auto-reset so the
// lobby never gets stuck holding a dead game. cleared on manual reset.
const AUTO_RESET_DELAY_MS = 15_000;
let autoResetTimer: NodeJS.Timeout | null = null;

function generateCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function avatarFor(name: string): string {
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
}

// detect the host's LAN ip so phones scanning the QR hit this machine,
// not their own localhost.
function getLanUrl(): string | null {
  const port = process.env.PORT || '3131';
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `http://${iface.address}:${port}`;
      }
    }
  }
  return null;
}

const LAN_URL = getLanUrl();

// resolve the currently selected game via the registry. the registry is
// populated by the side-effect import of `../games/index.js` above.
gameManager.setGameFactory((gameId: string) => {
  const selected = lobby.selectedGameId;
  if (!selected) throw new Error('no game selected');
  const reg = getGameRegistration(selected);
  if (!reg) throw new Error(`no factory registered for game: ${selected}`);
  return reg.createGame(gameId, { testMode: lobby.testMode });
});

export function setupSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`client connected: ${socket.id}`);

    socket.on('request-lobby', () => {
      socket.emit('lobby-info', {
        lobbyCode: lobby.code,
        players: lobby.players,
        selectedGameId: lobby.selectedGameId,
        testMode: lobby.testMode,
        started: lobby.started,
        lanUrl: LAN_URL,
      });
      if (lobby.activeGame) emitGameStateTo(io, socket);
    });

    socket.on('select-game', (gameId: string) => {
      if (lobby.started) return;
      lobby.selectedGameId = gameId;
      io.emit('game-selected', gameId);
    });

    socket.on('set-test-mode', (testMode: boolean) => {
      if (lobby.started) return;
      lobby.testMode = Boolean(testMode);
      io.emit('test-mode-changed', lobby.testMode);
    });

    socket.on('join-lobby', ({ name, code }: { name: string; code: string }) => {
      if (code !== lobby.code) {
        socket.emit('join-error', 'Invalid lobby code');
        return;
      }
      if (lobby.started) {
        socket.emit('join-error', 'Game already started');
        return;
      }

      // a CPU can never be host, so look for the first human when deciding host
      const hasHumanHost = lobby.players.some((p) => !p.isCpu && p.isHost);
      const isHost = !hasHumanHost;
      const newPlayer: Player = { id: socket.id, name, avatar: avatarFor(name), isHost, isCpu: false };
      lobby.players.push(newPlayer);
      socket.join(lobby.code);
      // broadcast so the main screen (not in the lobby room) also updates
      io.emit('player-joined', newPlayer);
      socket.emit('join-success', {
        players: lobby.players,
        lobbyCode: lobby.code,
        selectedGameId: lobby.selectedGameId,
        testMode: lobby.testMode,
        isHost,
      });
    });

    socket.on('add-cpu', () => {
      if (lobby.started) return;
      // allow main-screen sockets (not in players) as implicit host; reject
      // non-host human players.
      const requester = lobby.players.find((p) => p.id === socket.id);
      if (requester && !requester.isHost) return;
      if (lobby.players.length >= 12) return;
      const name = CPU_NAMES[cpuCounter % CPU_NAMES.length];
      cpuCounter += 1;
      const cpu: Player = {
        id: `cpu_${cpuCounter}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        avatar: avatarFor(`${name}-${cpuCounter}`),
        isHost: false,
        isCpu: true,
      };
      lobby.players.push(cpu);
      io.emit('player-joined', cpu);
    });

    socket.on('remove-cpu', () => {
      if (lobby.started) return;
      const requester = lobby.players.find((p) => p.id === socket.id);
      if (requester && !requester.isHost) return;
      for (let i = lobby.players.length - 1; i >= 0; i -= 1) {
        if (lobby.players[i].isCpu) {
          const [removed] = lobby.players.splice(i, 1);
          io.emit('player-left', removed.id);
          return;
        }
      }
    });

    socket.on('start-game', () => {
      const requester = lobby.players.find((p) => p.id === socket.id);
      if (requester && !requester.isHost) {
        socket.emit('error', { message: 'only the host can start' });
        return;
      }
      if (lobby.started && lobby.activeGame) {
        socket.emit('error', {
          message: 'a game is already in progress — end it from the game screen first',
        });
        return;
      }
      if (!lobby.selectedGameId) {
        socket.emit('error', { message: 'no game selected' });
        return;
      }
      if (lobby.players.length < 2) {
        socket.emit('error', { message: 'need at least 2 players' });
        return;
      }

      const game = gameManager.getOrCreateGame(lobby.code);
      // phase changes in the game trigger a broadcast, CPU driving, and
      // (when finished) an auto-reset countdown.
      (game as unknown as { onPhaseChange: (() => void) | null }).onPhaseChange = () => {
        broadcastGameState(io);
        driveCpus(io);
        maybeScheduleAutoReset(io, game);
      };
      for (const p of lobby.players) game.addPlayer(p.id, p.name);
      // assign activeGame BEFORE start() so the first setPhase inside start()
      // triggers a broadcast + driveCpus that actually fires (both bail when
      // activeGame is null).
      lobby.activeGame = game;
      if (!game.start(socket.id)) {
        socket.emit('error', { message: 'failed to start game' });
        lobby.activeGame = null;
        return;
      }

      lobby.started = true;
      io.emit('game-started', { gameId: lobby.selectedGameId });
      broadcastGameState(io);
    });

    socket.on('game-action', (action: PlayerAction) => {
      if (!lobby.activeGame) {
        socket.emit('error', { message: 'no active game' });
        return;
      }
      try {
        lobby.activeGame.handleAction(socket.id, action);
        broadcastGameState(io);
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : 'invalid action' });
      }
    });

    socket.on('host-skip-phase', () => {
      const requester = lobby.players.find((p) => p.id === socket.id);
      if (!requester?.isHost) return;
      const game = lobby.activeGame as unknown as { skipPhase?: () => void } | null;
      game?.skipPhase?.();
    });

    socket.on('return-to-lobby', () => {
      // allow main-screen sockets (not in players) as implicit host.
      const requester = lobby.players.find((p) => p.id === socket.id);
      if (requester && !requester.isHost) return;
      resetLobby(io);
    });

    socket.on('disconnect', () => {
      console.log(`client disconnected: ${socket.id}`);
      const idx = lobby.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        const [removed] = lobby.players.splice(idx, 1);
        // reassign host if needed (skip CPUs — they can't host)
        if (removed.isHost) {
          const nextHost = lobby.players.find((p) => !p.isCpu);
          if (nextHost) nextHost.isHost = true;
        }
        io.emit('player-left', removed.id);
      }
      if (lobby.activeGame) {
        lobby.activeGame.removePlayer(socket.id);
        broadcastGameState(io);
      }
      // if the room empties, reset so the next session starts fresh
      if (lobby.players.length === 0) {
        resetLobby(io);
      }
    });
  });
}

async function broadcastGameState(io: SocketIOServer): Promise<void> {
  if (!lobby.activeGame) return;
  // fetch all connected sockets (main screen + phones). single-lobby assumption.
  const sockets = await io.fetchSockets();
  for (const s of sockets) {
    const state = lobby.activeGame.getStateForPlayer
      ? lobby.activeGame.getStateForPlayer(s.id)
      : lobby.activeGame.getState();
    s.emit('game-state', state);
  }
}

// delegate CPU driving to the active game's registered driver. safe to
// call multiple times per phase — if a CPU has already acted, the game's
// handleAction throws and we swallow it inside scheduleCpu.
function driveCpus(io: SocketIOServer): void {
  if (!lobby.activeGame || !lobby.selectedGameId) return;
  const reg = getGameRegistration(lobby.selectedGameId);
  if (!reg?.driveCpus) return;

  const cpuIds = lobby.players.filter((p) => p.isCpu).map((p) => p.id);
  if (cpuIds.length === 0) return;

  reg.driveCpus({
    game: lobby.activeGame,
    cpuPlayerIds: cpuIds,
    difficulty: lobby.cpuDifficulty,
    schedule: (fn) => scheduleCpu(io, fn),
  });
}

function scheduleCpu(io: SocketIOServer, fn: () => void): void {
  const delay = 800 + Math.floor(Math.random() * 1200);
  setTimeout(() => {
    if (!lobby.activeGame) return;
    try {
      fn();
      void broadcastGameState(io);
    } catch {
      // phase likely advanced, ignore
    }
  }, delay);
}

function emitGameStateTo(_io: SocketIOServer, socket: Socket): void {
  if (!lobby.activeGame) return;
  const state = lobby.activeGame.getStateForPlayer
    ? lobby.activeGame.getStateForPlayer(socket.id)
    : lobby.activeGame.getState();
  socket.emit('game-state', state);
}

function resetLobby(io: SocketIOServer): void {
  if (autoResetTimer) {
    clearTimeout(autoResetTimer);
    autoResetTimer = null;
  }
  if (lobby.activeGame) {
    lobby.activeGame.destroy?.();
    gameManager.removeGame(lobby.code);
  }
  lobby.code = generateCode();
  lobby.players = [];
  lobby.selectedGameId = null;
  lobby.started = false;
  lobby.activeGame = null;
  lobby.cpuDifficulty = DEFAULT_DIFFICULTY;
  io.emit('lobby-reset', { lobbyCode: lobby.code });
}

function maybeScheduleAutoReset(io: SocketIOServer, game: GameInterface): void {
  if (autoResetTimer) return; // already scheduled
  if (game.getState().status !== 'finished') return;
  console.log(`game finished; scheduling auto-reset in ${AUTO_RESET_DELAY_MS}ms`);
  autoResetTimer = setTimeout(() => {
    autoResetTimer = null;
    resetLobby(io);
  }, AUTO_RESET_DELAY_MS);
}
