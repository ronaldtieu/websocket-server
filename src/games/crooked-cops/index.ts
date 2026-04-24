// Registers Crooked Cops with the server-side game registry.
// Side-effect import via src/games/index.ts is all that's needed for the
// socket handler to find this game.

import { registerGame } from '../registry.js';
import { CrookedCopsGame } from './CrookedCopsGame.js';
import { driveCrookedCopsCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'crooked-cops',
    title: 'CROOKED COPS',
    description:
      'Subway social-deduction. Thieves grab pieces, cops chase — but two cops are crooked.',
    minPlayers: 2,
    maxPlayers: 14,
    image:
      'https://images.unsplash.com/photo-1502920514313-52581002a659?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new CrookedCopsGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveCrookedCopsCpus,
});
