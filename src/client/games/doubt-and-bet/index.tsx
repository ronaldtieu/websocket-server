// registers doubt-and-bet with the client-side game registry. side-effect
// import via src/client/games/index.ts is all that's needed to surface it.

import { registerClientGame } from '../registry';
import { DoubtAndBetMainScreen } from './MainScreen';
import { DoubtAndBetPhone } from './Phone';
import { DoubtAndBetInstructions } from './Instructions';
import type { DoubtPublicState, DoubtStateForPlayer } from './types';

registerClientGame<DoubtStateForPlayer, DoubtPublicState>({
  manifest: {
    id: 'doubt-and-bet',
    title: 'DOUBT AND BET',
    description:
      "Liar's Dice with colored cards. Claim what's on the table — your neighbor raises or doubts.",
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: DoubtAndBetMainScreen,
  Phone: DoubtAndBetPhone,
  Instructions: DoubtAndBetInstructions,
  unwrapState: (envelope) =>
    (envelope as { doubtAndBet?: DoubtStateForPlayer } | null)?.doubtAndBet ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    activeSeat: playerState.activeSeat,
    responderSeat: playerState.responderSeat,
    phaseDeadline: playerState.phaseDeadline,
    currentClaim: playerState.currentClaim,
    claimHistory: playerState.claimHistory,
    seating: playerState.seating,
    lastResolution: playerState.lastResolution,
    players: playerState.players,
    attritionEvery: playerState.attritionEvery,
    rotateEvery: playerState.rotateEvery,
    totalEliminations: playerState.totalEliminations,
  }),
});
