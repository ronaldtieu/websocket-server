// registers time-auction with the client-side game registry. imported for
// side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { TimeAuctionMainScreen } from './MainScreen';
import { TimeAuctionPhone } from './Phone';
import { TimeAuctionInstructions } from './Instructions';
import type { TimeAuctionPublicState, TimeAuctionStateForPlayer } from './types';

registerClientGame<TimeAuctionStateForPlayer, TimeAuctionPublicState>({
  manifest: {
    id: 'time-auction',
    title: 'TIME AUCTION',
    description:
      'Hold to bid. Spend your Time Bank in real time — highest bid wins the Token, but losing bids stay secret.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1501139083538-0139583c060f?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: TimeAuctionMainScreen,
  Phone: TimeAuctionPhone,
  Instructions: TimeAuctionInstructions,
  unwrapState: (envelope) =>
    (envelope as { timeAuction?: TimeAuctionStateForPlayer } | null)?.timeAuction ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    totalRounds: playerState.totalRounds,
    phaseDeadline: playerState.phaseDeadline,
    biddingStartedAt: playerState.biddingStartedAt,
    players: playerState.players,
    log: playerState.log,
    lastReveal: playerState.lastReveal,
  }),
});
