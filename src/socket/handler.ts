// handles all real-time communication between players and the server

import { Server as SocketIOServer, Socket } from 'socket.io';
import { gameManager } from '../games/GameManager.js';
import type { GameInterface, PlayerAction } from '../games/GameInterface.js';

// events that go from the client to the server
const CLIENT_TO_SERVER = {
  JOIN_GAME: 'join_game',
  LEAVE_GAME: 'leave_game',
  GAME_ACTION: 'game_action',
  START_GAME: 'start_game',
} as const;

// events that go from the server to the client
const SERVER_TO_CLIENT = {
  GAME_STATE: 'game_state',
  ERROR: 'error',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  GAME_STARTED: 'game_started',
} as const;

export const SocketEvents = { ...CLIENT_TO_SERVER, ...SERVER_TO_CLIENT };

// stores info about each connected player
interface PlayerData {
  playerId: string;
  playerName: string;
  currentGameId?: string;
}

// sets up all the event listeners for socket.io connections
export function setupSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`client connected: ${socket.id}`);

    // player joins a game
    socket.on(SocketEvents.JOIN_GAME, ({ gameId, playerName }: { gameId: string; playerName: string }) => {
      try {
        const game = gameManager.getOrCreateGame(gameId);

        if (game.isFull()) {
          socket.emit(SocketEvents.ERROR, { message: 'game is full' });
          return;
        }

        const success = game.addPlayer(socket.id, playerName);
        if (!success) {
          socket.emit(SocketEvents.ERROR, { message: 'failed to join game' });
          return;
        }

        const playerData: PlayerData = {
          playerId: socket.id,
          playerName,
          currentGameId: gameId,
        };
        socket.data = playerData;

        socket.join(gameId);

        socket.emit(SocketEvents.GAME_STATE, game.getState());

        socket.to(gameId).emit(SocketEvents.PLAYER_JOINED, {
          playerId: socket.id,
          playerName,
        });

        console.log(`${playerName} joined game: ${gameId}`);
      } catch (error) {
        console.error('error joining game:', error);
        socket.emit(SocketEvents.ERROR, { message: 'failed to join game' });
      }
    });

    // player leaves a game
    socket.on(SocketEvents.LEAVE_GAME, () => {
      handleLeaveGame(socket);
    });

    // player performs an action
    socket.on(SocketEvents.GAME_ACTION, (action: PlayerAction) => {
      const { currentGameId, playerId } = socket.data as PlayerData;

      if (!currentGameId) {
        socket.emit(SocketEvents.ERROR, { message: 'not in a game' });
        return;
      }

      const game = gameManager.getGame(currentGameId);
      if (!game) {
        socket.emit(SocketEvents.ERROR, { message: 'game not found' });
        return;
      }

      try {
        const newState = game.handleAction(playerId, action);
        io.to(currentGameId).emit(SocketEvents.GAME_STATE, newState);
      } catch (error) {
        console.error('error handling game action:', error);
        socket.emit(SocketEvents.ERROR, { message: 'invalid action' });
      }
    });

    // player wants to start the game
    socket.on(SocketEvents.START_GAME, () => {
      const { currentGameId, playerId } = socket.data as PlayerData;

      if (!currentGameId) {
        socket.emit(SocketEvents.ERROR, { message: 'not in a game' });
        return;
      }

      const game = gameManager.getGame(currentGameId);
      if (!game) {
        socket.emit(SocketEvents.ERROR, { message: 'game not found' });
        return;
      }

      const success = game.start(playerId);
      if (success) {
        io.to(currentGameId).emit(SocketEvents.GAME_STARTED, game.getState());
      } else {
        socket.emit(SocketEvents.ERROR, { message: 'cannot start game' });
      }
    });

    // player disconnects
    socket.on('disconnect', () => {
      console.log(`client disconnected: ${socket.id}`);
      handleLeaveGame(socket);
    });
  });
}

// handles cleanup when a player leaves or disconnects
function handleLeaveGame(socket: Socket): void {
  const { currentGameId, playerName, playerId } = socket.data as PlayerData;

  if (!currentGameId) {
    return;
  }

  const game = gameManager.getGame(currentGameId);
  if (!game) {
    return;
  }

  game.removePlayer(playerId);

  socket.leave(currentGameId);

  socket.to(currentGameId).emit(SocketEvents.PLAYER_LEFT, {
    playerId,
    playerName,
  });

  socket.to(currentGameId).emit(SocketEvents.GAME_STATE, game.getState());

  console.log(`${playerName} left game: ${currentGameId}`);

  if (game.getPlayerCount() === 0) {
    gameManager.removeGame(currentGameId);
  }
}
