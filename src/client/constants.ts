// roster exposed to the lobby. derived from the client-side game registry
// (each game self-registers via src/client/games/<id>/index.tsx). add a
// game by dropping its directory and adding one line to src/client/games/index.ts.

import './games/index';
import { listClientGameManifests } from './games/registry';
import type { GameInfo } from './types';

export const MOCK_GAMES: (GameInfo & { playable?: boolean })[] = listClientGameManifests();
