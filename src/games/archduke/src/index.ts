// registers archduke with the server-side game registry.
// importing this module as a side-effect (via src/games/index.ts) is all
// that's required for the socket handler to pick the game up.

import { registerGame } from '../../registry.js';
import { ArchdukeGame } from './ArchdukeGame.js';
import { driveArchdukeCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'archduke',
    title: 'ARCHDUKE',
    description:
      'Low-score wins. Swap cards into your hidden set, match to dump cards, and use face-card actions to peek, give, and scramble positions.',
    minPlayers: 2,
    maxPlayers: 6,
    image:
      'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new ArchdukeGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveArchdukeCpus,
});
