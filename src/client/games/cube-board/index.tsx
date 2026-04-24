// Registers cube-board ("UNKNOWN") with the client-side game registry.
// imported for side effects via src/client/games/index.ts.

import { registerClientGame } from '../registry';
import { CubeBoardMainScreen } from './MainScreen';
import { CubeBoardPhone } from './Phone';
import { CubeBoardInstructions } from './Instructions';
import type { CubeBoardPublicState, CubeBoardStateForPlayer } from './types';

registerClientGame<CubeBoardStateForPlayer, CubeBoardPublicState>({
  manifest: {
    id: 'cube-board',
    title: 'UNKNOWN',
    description:
      'Tip a cube across a colored grid. Race to the black square — but most rules are hidden until you trigger them.',
    minPlayers: 2,
    maxPlayers: 12,
    image:
      'https://images.unsplash.com/photo-1606326608690-4e0281b1e588?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: CubeBoardMainScreen,
  Phone: CubeBoardPhone,
  Instructions: CubeBoardInstructions,
  unwrapState: (envelope) =>
    (envelope as { cubeBoard?: CubeBoardStateForPlayer } | null)?.cubeBoard ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    practiceRoundsRemaining: playerState.practiceRoundsRemaining,
    turnIndex: playerState.turnIndex,
    turnOrder: playerState.turnOrder,
    board: playerState.board,
    players: playerState.players,
    revealedRules: playerState.revealedRules,
    pendingReveal: playerState.pendingReveal,
    lastEvent: playerState.lastEvent,
    finalRanking: playerState.finalRanking,
    hiddenRulesActive: playerState.hiddenRulesActive,
  }),
});
