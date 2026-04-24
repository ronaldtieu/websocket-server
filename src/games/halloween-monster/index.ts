// registers Halloween Monster with the server-side game registry.
// importing this module as a side-effect (via src/games/index.ts) is all
// that's required for the socket handler to pick the game up.

import { registerGame } from '../registry.js';
import { HalloweenMonsterGame } from './HalloweenMonsterGame.js';
import { driveHalloweenCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'halloween-monster',
    title: 'HALLOWEEN MONSTER',
    description:
      'Form alliances, hunt monsters, and survive the Hidden Twist — your fellow players might be on the menu.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new HalloweenMonsterGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveHalloweenCpus,
});
