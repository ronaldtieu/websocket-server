// client-side game registry. mirror of the server registry: each game
// self-registers its React components + metadata + state unwrappers so
// App.tsx never has to know which games exist.

import type { ComponentType } from 'react';
import type { GameInfo } from '../types';

// shape passed to the main-screen component. TPublic is the game's
// public-state type. isHost gates host-only controls (skip phase, return
// to lobby, etc.).
export interface MainScreenProps<TPublic = unknown> {
  state: TPublic;
  isHost: boolean;
  onReturnToLobby: () => void;
}

// shape passed to the phone component. TForPlayer is the per-player
// filtered state from the server. phone components emit their own
// PlayerActions via the socket singleton (see src/client/lib/socket.ts).
export interface PhoneProps<TForPlayer = unknown> {
  state: TForPlayer;
}

export interface ClientGameRegistration<TForPlayer = any, TPublic = TForPlayer> {
  // manifest drives the lobby game-selection UI. `playable: false` leaves
  // a card in the roster but locks it; useful for wired-up-but-untested
  // games in development.
  manifest: GameInfo & { playable?: boolean };

  MainScreen: ComponentType<MainScreenProps<TPublic>>;
  Phone: ComponentType<PhoneProps<TForPlayer>>;
  Instructions?: ComponentType<Record<string, never>>;

  // pull this game's per-player state out of the server's game-state
  // envelope. the server wraps each game's state under a key named
  // after the game (e.g. `{ removeOne: {...} }`). return null/undefined
  // when the envelope doesn't carry state for this game yet.
  unwrapState: (envelope: unknown) => TForPlayer | null | undefined;

  // derive the public (main-screen) state from the per-player payload.
  // if omitted, the per-player state is used as-is — fine for games
  // with no hidden info.
  toPublicState?: (playerState: TForPlayer) => TPublic;
}

const registry = new Map<string, ClientGameRegistration<any, any>>();

export function registerClientGame<TForPlayer, TPublic>(
  reg: ClientGameRegistration<TForPlayer, TPublic>,
): void {
  if (registry.has(reg.manifest.id)) {
    throw new Error(`client game already registered: ${reg.manifest.id}`);
  }
  registry.set(reg.manifest.id, reg as ClientGameRegistration<any, any>);
}

export function getClientGame(id: string): ClientGameRegistration | undefined {
  return registry.get(id);
}

export function listClientGames(): ClientGameRegistration[] {
  return Array.from(registry.values());
}

export function listClientGameManifests(): (GameInfo & { playable?: boolean })[] {
  return Array.from(registry.values()).map((r) => r.manifest);
}
