// registers remove-one with the server-side game registry.
// importing this module as a side-effect (via src/games/index.ts) is all
// that's required for the socket handler to pick the game up.

import { registerGame } from '../registry.js';
import { RemoveOneGame } from './RemoveOneGame.js';
import { driveRemoveOneCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'remove-one',
    title: 'REMOVE ONE',
    description:
      'Smallest-unique bluff. Peek two, play one — the card nobody else plays wins.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1541278107931-e006523892df?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new RemoveOneGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveRemoveOneCpus,
});
