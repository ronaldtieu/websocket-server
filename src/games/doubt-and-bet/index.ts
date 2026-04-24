// registers doubt-and-bet with the server-side game registry.
// importing this module as a side-effect (via src/games/index.ts) is all
// that's required for the socket handler to pick the game up.

import { registerGame } from '../registry.js';
import { DoubtAndBetGame } from './DoubtAndBetGame.js';
import { driveDoubtAndBetCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'doubt-and-bet',
    title: 'DOUBT AND BET',
    description:
      "Liar's Dice with colored cards. Claim what's on the table — your neighbor raises or doubts.",
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new DoubtAndBetGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveDoubtAndBetCpus,
});
