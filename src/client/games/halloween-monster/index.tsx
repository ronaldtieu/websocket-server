// registers Halloween Monster with the client-side game registry. imported
// for side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { HalloweenMonsterMainScreen } from './MainScreen';
import { HalloweenMonsterPhone } from './Phone';
import { HalloweenMonsterInstructions } from './Instructions';
import type { HalloweenPublicState, HalloweenStateForPlayer } from './types';

registerClientGame<HalloweenStateForPlayer, HalloweenPublicState>({
  manifest: {
    id: 'halloween-monster',
    title: 'HALLOWEEN MONSTER',
    description:
      'Form alliances, hunt monsters, and survive the Hidden Twist — your fellow players might be on the menu.',
    minPlayers: 2,
    maxPlayers: 8,
    image:
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&q=80&w=400',
    playable: true,
  },
  MainScreen: HalloweenMonsterMainScreen,
  Phone: HalloweenMonsterPhone,
  Instructions: HalloweenMonsterInstructions,
  unwrapState: (envelope) =>
    (envelope as { halloween?: HalloweenStateForPlayer } | null)?.halloween ?? null,
  toPublicState: (playerState) => ({
    phase: playerState.phase,
    round: playerState.round,
    totalRounds: playerState.totalRounds,
    phaseDeadline: playerState.phaseDeadline,
    currentPlayerId: playerState.currentPlayerId,
    players: playerState.players,
    monsters: playerState.monsters,
    alliances: playerState.alliances,
    twistRevealed: playerState.twistRevealed,
    lastAttack: playerState.lastAttack,
  }),
});
