// registers treasure-island with the client-side game registry. imported for
// side effects via src/client/games/index.ts — that's the wiring that makes
// the game render when active.

import { registerClientGame } from '../registry';
import { TreasureIslandMainScreen } from './MainScreen';
import { TreasureIslandPhone } from './Phone';
import { TreasureIslandInstructions } from './Instructions';
import type { TreasureIslandPublicState, TreasureIslandStateForPlayer } from './types';

registerClientGame<TreasureIslandStateForPlayer, TreasureIslandPublicState>({
  manifest: {
    id: 'treasure-island',
    title: 'TREASURE ISLAND',
    description:
      'Sealed-bid auctions for arrows, then explore an island grid to find the hidden treasure.',
    minPlayers: 2,
    maxPlayers: 10,
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: TreasureIslandMainScreen,
  Phone: TreasureIslandPhone,
  Instructions: TreasureIslandInstructions,
  unwrapState: (envelope) =>
    (envelope as { treasureIsland?: TreasureIslandStateForPlayer } | null)?.treasureIsland ?? null,
  toPublicState: (s) => ({
    phase: s.phase,
    round: s.round,
    totalRounds: s.totalRounds,
    phaseDeadline: s.phaseDeadline,
    board: s.board,
    players: s.players,
    auctionOffers: s.auctionOffers,
    lastAuctionResults: s.lastAuctionResults,
    explorationPaths: s.explorationPaths,
    openedBoxes: s.openedBoxes,
    ruleLog: s.ruleLog,
    hiddenRuleDiscovered: s.hiddenRuleDiscovered,
    treasureFinderId: s.treasureFinderId,
    treasureSteals: s.treasureSteals,
  }),
});
