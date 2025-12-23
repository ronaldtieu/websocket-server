// keeps track of all the game rooms that are running.
// when players join, we find or create their game.
// when they leave, we clean up empty games.

import { GameInterface } from './GameInterface.js';

// a function that creates new game instances.
// replace with actual game
export type GameFactory = (gameId: string) => GameInterface;

export class GameManager {
  // all the currently running games, keyed by room name
  private games: Map<string, GameInterface> = new Map();

  // the factory function we'll use to create new games
  private gameFactory?: GameFactory;

  constructor(gameFactory?: GameFactory) {
    this.gameFactory = gameFactory;
  }

  // tell the manager how to create games. call this with your game class.
  setGameFactory(factory: GameFactory): void {
    this.gameFactory = factory;
  }

  // make a new game room
  createGame(gameId: string): GameInterface {
    if (!this.gameFactory) {
      throw new Error('game factory not set. call setGameFactory() first.');
    }

    const game = this.gameFactory(gameId);
    this.games.set(gameId, game);
    return game;
  }

  // find a game by room name, or undefined if it doesn't exist
  getGame(gameId: string): GameInterface | undefined {
    return this.games.get(gameId);
  }

  // get the game, or create it if it doesn't exist yet.
  // used when players join.
  getOrCreateGame(gameId: string): GameInterface {
    let game = this.games.get(gameId);
    if (!game) {
      game = this.createGame(gameId);
    }
    return game;
  }

  // delete a game and clean it up.
  // returns true if we found and deleted it.
  removeGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (game) {
      game.destroy?.();
      return this.games.delete(gameId);
    }
    return false;
  }

  // get all active game room names
  getActiveGames(): string[] {
    return Array.from(this.games.keys());
  }

  // how many games are running right now
  getGameCount(): number {
    return this.games.size;
  }

  // delete any games that have no players left.
  // frees up memory.
  cleanupEmptyGames(): void {
    for (const [gameId, game] of this.games.entries()) {
      if (game.getPlayerCount() === 0) {
        this.removeGame(gameId);
        console.log(`cleaned up empty game: ${gameId}`);
      }
    }
  }
}

// one shared instance that the whole app uses.
export const gameManager = new GameManager();
