// registers Balance Mancala with the client-side game registry. imported
// for side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { BalanceMancalaMainScreen } from './MainScreen';
import { BalanceMancalaPhone } from './Phone';
import { BalanceMancalaInstructions } from './Instructions';
import type { MancalaPublicState, MancalaStateForPlayer } from './types';

registerClientGame<MancalaStateForPlayer, MancalaPublicState>({
  manifest: {
    id: 'balance-mancala',
    title: 'BALANCE MANCALA',
    description:
      'Sow stones around a 14-dish ring. Score the three colors evenly — leaders crash, the balanced thrive.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1606503153255-59d8b8b7c87a?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: BalanceMancalaMainScreen,
  Phone: BalanceMancalaPhone,
  Instructions: BalanceMancalaInstructions,
  unwrapState: (envelope) =>
    (envelope as { balanceMancala?: MancalaStateForPlayer } | null)?.balanceMancala ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    dishes: playerState.dishes,
    players: playerState.players,
    turnOrder: playerState.turnOrder,
    currentPlayerId: playerState.currentPlayerId,
    phaseDeadline: playerState.phaseDeadline,
    winnerId: playerState.winnerId,
    lastMove: playerState.lastMove,
  }),
});
