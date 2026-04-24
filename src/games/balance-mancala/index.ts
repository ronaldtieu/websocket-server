// registers Balance Mancala with the server-side game registry. importing
// this module as a side-effect (via src/games/index.ts) is all that's
// required for the socket handler to pick up the game.

import { registerGame } from '../registry.js';
import { BalanceMancalaGame } from './BalanceMancalaGame.js';
import { driveBalanceMancalaCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'balance-mancala',
    title: 'BALANCE MANCALA',
    description:
      'Sow stones around a 14-dish ring. Score the three colors evenly — leaders crash, the balanced thrive.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1606503153255-59d8b8b7c87a?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new BalanceMancalaGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveBalanceMancalaCpus,
});
