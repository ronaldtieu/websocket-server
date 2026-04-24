// registers remove-one with the client-side game registry. imported for
// side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { RemoveOneMainScreen } from './MainScreen';
import { RemoveOnePhone } from './Phone';
import { RemoveOneInstructions } from './Instructions';
import type { RemoveOnePublicState, RemoveOneStateForPlayer } from './types';

registerClientGame<RemoveOneStateForPlayer, RemoveOnePublicState>({
  manifest: {
    id: 'remove-one',
    title: 'REMOVE ONE',
    description:
      'Smallest-unique bluff. Peek two, play one — the card nobody else plays wins.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1541278107931-e006523892df?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: RemoveOneMainScreen,
  Phone: RemoveOnePhone,
  Instructions: RemoveOneInstructions,
  unwrapState: (envelope) =>
    (envelope as { removeOne?: RemoveOneStateForPlayer } | null)?.removeOne ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    totalRounds: playerState.totalRounds,
    phaseDeadline: playerState.phaseDeadline,
    players: playerState.players,
    lastScoring: playerState.lastScoring,
    checkpointRounds: playerState.checkpointRounds,
  }),
});
