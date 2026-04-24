// Registers cube-board ("UNKNOWN") with the server-side game registry.
// importing this module via src/games/index.ts is the only side-effect
// needed for the socket handler to surface the game.

import { registerGame } from '../registry.js';
import { CubeBoardGame } from './CubeBoardGame.js';
import { driveCubeBoardCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'cube-board',
    title: 'UNKNOWN',
    description:
      'Tip a cube across a colored grid. Race to the black square — but most rules are hidden until you trigger them.',
    minPlayers: 2,
    maxPlayers: 12,
    image:
      'https://images.unsplash.com/photo-1606326608690-4e0281b1e588?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new CubeBoardGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveCubeBoardCpus,
});
