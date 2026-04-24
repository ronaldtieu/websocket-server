// defines the contract between the websocket server and your game logic
// your game class implements this interface
// the server calls these methods to interact with your game

// when a player does something in the game, it comes through as a playeraction
export type PlayerAction = {
  type: string;
  payload: unknown;
};

// represents a single player in the game
export type PlayerState = {
  id: string;
  name: string;
  isConnected: boolean;
};

// the overall game state that gets sent to all players
export type GameState = {
  players: PlayerState[];
  status: 'waiting' | 'in_progress' | 'finished';
  [key: string]: unknown;
};

// your game class must implement all of these methods
export interface GameInterface {
  // unique id for this game instance
  readonly gameId: string;

  // returns the current state of the game (public view — safe to broadcast)
  getState(): GameState;

  // returns per-player filtered state (hidden hands, private roles, etc.).
  // optional — games without hidden info can omit and the server falls back to getState().
  getStateForPlayer?(playerId: string): GameState;

  // add a new player to the game
  addPlayer(playerId: string, playerName: string): boolean;

  // remove a player from the game
  removePlayer(playerId: string): void;

  // handle a player action and return the new state
  handleAction(playerId: string, action: PlayerAction): GameState;

  // returns true if the game is full
  isFull(): boolean;

  // returns true if the game has started
  hasStarted(): boolean;

  // returns how many players are in the game
  getPlayerCount(): number;

  // start the game
  start(playerId: string): boolean;

  // cleanup when the game is destroyed
  destroy?(): void;
}
