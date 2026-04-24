// registers treasure-island with the server-side game registry. importing this
// module as a side-effect (via src/games/index.ts) makes the game discoverable
// to the socket handler.

import { registerGame } from '../registry.js';
import { TreasureIslandGame } from './TreasureIslandGame.js';
import { driveTreasureIslandCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'treasure-island',
    title: 'TREASURE ISLAND',
    description:
      'Sealed-bid auctions for arrows, then explore an island grid to find the hidden treasure.',
    minPlayers: 2,
    maxPlayers: 10,
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new TreasureIslandGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveTreasureIslandCpus,
});
