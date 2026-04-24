// registers archduke with the client-side game registry. imported for
// side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { ArchdukeMainScreen } from './MainScreen';
import { ArchdukePhone } from './Phone';
import { ArchdukeInstructions } from './Instructions';
import type { ArchdukePublicState, ArchdukeStateForPlayer } from './types';

registerClientGame<ArchdukeStateForPlayer, ArchdukePublicState>({
  manifest: {
    id: 'archduke',
    title: 'ARCHDUKE',
    description:
      'Low-score wins. Swap cards into your hidden set, match to dump cards, and use face-card actions to peek, give, and scramble positions.',
    minPlayers: 2,
    maxPlayers: 6,
    image:
      'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: ArchdukeMainScreen,
  Phone: ArchdukePhone,
  Instructions: ArchdukeInstructions,
  unwrapState: (envelope) =>
    (envelope as { archduke?: ArchdukeStateForPlayer } | null)?.archduke ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    totalRounds: playerState.totalRounds,
    phaseDeadline: playerState.phaseDeadline,
    turnsTakenThisRound: playerState.turnsTakenThisRound,
    turnsPerRound: playerState.turnsPerRound,
    deckRemaining: playerState.deckRemaining,
    discardTop: playerState.discardTop,
    players: playerState.players,
    turn: playerState.turn,
    lastRoundSummary: playerState.lastRoundSummary,
    winnerId: playerState.winnerId,
  }),
});
