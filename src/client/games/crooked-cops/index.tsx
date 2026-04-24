// Registers Crooked Cops with the client-side game registry. Side-effect
// imported via src/client/games/index.ts.

import { registerClientGame } from '../registry';
import { CrookedCopsMainScreen } from './MainScreen';
import { CrookedCopsPhone } from './Phone';
import { CrookedCopsInstructions } from './Instructions';
import type { CrookedCopsPublicState, CrookedCopsStateForPlayer } from './types';

registerClientGame<CrookedCopsStateForPlayer, CrookedCopsPublicState>({
  manifest: {
    id: 'crooked-cops',
    title: 'CROOKED COPS',
    description:
      'Subway social-deduction. Thieves grab pieces, cops chase — but two cops are crooked.',
    minPlayers: 2,
    maxPlayers: 14,
    image:
      'https://images.unsplash.com/photo-1502920514313-52581002a659?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: CrookedCopsMainScreen,
  Phone: CrookedCopsPhone,
  Instructions: CrookedCopsInstructions,
  unwrapState: (envelope) =>
    (envelope as { crookedCops?: CrookedCopsStateForPlayer } | null)?.crookedCops ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    totalRounds: playerState.totalRounds,
    phaseDeadline: playerState.phaseDeadline,
    graph: playerState.graph,
    players: playerState.players,
    publicPieceCount: playerState.publicPieceCount,
    lastArrest: playerState.lastArrest,
    radio: [], // main screen never sees radio chatter
    outcome: playerState.outcome,
    pieceAwards: playerState.pieceAwards,
  }),
});
