// registers time-auction with the server-side game registry.
// importing this module as a side-effect (via src/games/index.ts) is all
// that's required for the socket handler to pick the game up.

import { registerGame } from '../registry.js';
import { TimeAuctionGame } from './TimeAuctionGame.js';
import { driveTimeAuctionCpus } from './cpu.js';

registerGame({
  manifest: {
    id: 'time-auction',
    title: 'TIME AUCTION',
    description:
      'Hold to bid. Spend your Time Bank in real time — highest bid wins the Token, but losing bids stay secret.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1501139083538-0139583c060f?auto=format&fit=crop&q=80&w=400',
  },
  createGame: (gameId, opts) => new TimeAuctionGame(gameId, { testMode: opts.testMode }),
  driveCpus: driveTimeAuctionCpus,
});
