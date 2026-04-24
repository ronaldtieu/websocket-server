// server-side game registry. every game lives under src/games/<id>/ and
// publishes itself via registerGame() from its own index.ts. the socket
// handler reads the registry instead of switch-casing on game id, so
// adding a game is "drop a directory, import its barrel" with zero
// edits to the handler.

import type { GameInterface } from './GameInterface.js';
import type { Difficulty } from './cpu/difficulty.js';

// lightweight public description of a game. mirrors the client-side manifest
// so the lobby UI has a consistent roster without cross-importing client code.
export interface GameManifest {
  id: string;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  image?: string;
}

export interface CreateGameOptions {
  testMode: boolean;
}

// CPU drivers are called after every phase change. the driver reads
// per-player state, decides whether a CPU should act, and schedules
// the action via the supplied `schedule` callback (which applies a
// delay and broadcasts state after).
export interface CpuDriverArgs {
  game: GameInterface;
  cpuPlayerIds: string[];
  difficulty: Difficulty;
  schedule: (fn: () => void) => void;
}

export type CpuDriver = (args: CpuDriverArgs) => void;

export interface GameRegistration {
  manifest: GameManifest;
  createGame: (gameId: string, opts: CreateGameOptions) => GameInterface;
  driveCpus?: CpuDriver;
}

const registry = new Map<string, GameRegistration>();

export function registerGame(reg: GameRegistration): void {
  if (registry.has(reg.manifest.id)) {
    throw new Error(`game already registered: ${reg.manifest.id}`);
  }
  registry.set(reg.manifest.id, reg);
}

export function getGameRegistration(id: string): GameRegistration | undefined {
  return registry.get(id);
}

export function listGameManifests(): GameManifest[] {
  return Array.from(registry.values()).map((r) => r.manifest);
}

export function hasGame(id: string): boolean {
  return registry.has(id);
}
