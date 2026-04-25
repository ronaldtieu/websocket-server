// registers Halloween Monster with the client-side game registry. imported
// for side effects via src/client/games/index.ts — that's all the wiring
// needed to make the game appear in the lobby and render in play.

import { registerClientGame } from '../registry';
import { HalloweenMonsterMainScreen } from './MainScreen';
import { HalloweenMonsterPhone } from './Phone';
import { HalloweenMonsterInstructions } from './Instructions';
import type { HalloweenPublicState, HalloweenStateForPlayer } from './types';

const HALLOWEEN_MONSTER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240" shape-rendering="crispEdges">
  <rect width="400" height="240" fill="#11091f"/>
  <rect y="128" width="400" height="112" fill="#24103a"/>
  <rect y="176" width="400" height="64" fill="#09070f"/>

  <rect x="300" y="30" width="50" height="50" fill="#ffd36e"/>
  <rect x="316" y="30" width="50" height="50" fill="#11091f"/>

  <rect x="48" y="38" width="6" height="6" fill="#ffe7a8"/>
  <rect x="90" y="58" width="6" height="6" fill="#ffe7a8"/>
  <rect x="124" y="28" width="6" height="6" fill="#ffe7a8"/>
  <rect x="212" y="50" width="6" height="6" fill="#ffe7a8"/>
  <rect x="260" y="76" width="6" height="6" fill="#ffe7a8"/>

  <rect x="134" y="96" width="132" height="16" fill="#160d23"/>
  <rect x="150" y="112" width="100" height="68" fill="#160d23"/>
  <rect x="166" y="78" width="24" height="18" fill="#160d23"/>
  <rect x="210" y="78" width="24" height="18" fill="#160d23"/>
  <rect x="178" y="126" width="18" height="18" fill="#ffd36e"/>
  <rect x="206" y="126" width="18" height="18" fill="#ffd36e"/>
  <rect x="194" y="148" width="12" height="32" fill="#4f2446"/>

  <rect x="94" y="150" width="16" height="30" fill="#0f0a18"/>
  <rect x="80" y="164" width="44" height="10" fill="#0f0a18"/>
  <rect x="108" y="136" width="6" height="8" fill="#0f0a18"/>

  <rect x="286" y="152" width="12" height="28" fill="#0f0a18"/>
  <rect x="274" y="164" width="36" height="10" fill="#0f0a18"/>
  <rect x="290" y="138" width="6" height="8" fill="#0f0a18"/>

  <rect x="40" y="188" width="320" height="6" fill="#3d2d22"/>
  <rect x="54" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="82" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="110" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="138" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="166" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="194" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="222" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="250" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="278" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="306" y="178" width="6" height="20" fill="#3d2d22"/>
  <rect x="334" y="178" width="6" height="20" fill="#3d2d22"/>

  <rect x="92" y="194" width="18" height="18" fill="#ff9a2e"/>
  <rect x="96" y="198" width="4" height="4" fill="#311302"/>
  <rect x="102" y="198" width="4" height="4" fill="#311302"/>
  <rect x="98" y="204" width="8" height="4" fill="#311302"/>
  <rect x="98" y="190" width="4" height="4" fill="#4b8c3b"/>

  <rect x="300" y="198" width="16" height="16" fill="#ff9a2e"/>
  <rect x="304" y="202" width="4" height="4" fill="#311302"/>
  <rect x="310" y="202" width="4" height="4" fill="#311302"/>
  <rect x="306" y="208" width="6" height="4" fill="#311302"/>
  <rect x="306" y="194" width="4" height="4" fill="#4b8c3b"/>

  <rect x="0" y="220" width="400" height="20" fill="#050407"/>
</svg>
`)}`;

registerClientGame<HalloweenStateForPlayer, HalloweenPublicState>({
  manifest: {
    id: 'halloween-monster',
    title: 'HALLOWEEN MONSTER',
    description:
      'Form alliances, hunt monsters, and survive the Hidden Twist — your fellow players might be on the menu.',
    minPlayers: 2,
    maxPlayers: 8,
    image: HALLOWEEN_MONSTER_IMAGE,
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
