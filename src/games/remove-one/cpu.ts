// CPU driver for remove-one. moved out of src/socket/handler.ts so the
// handler stays game-agnostic. no difficulty-aware logic yet — the
// existing behavior (random legal selection + random pick between the
// two peeked cards) is preserved. swap in an evaluator later if we want
// easy/medium/hard to diverge for this game.

import type { CpuDriver } from '../registry.js';

type CpuView = {
  removeOne?: {
    phase: string;
    me?: {
      private: {
        hand: number[];
        selection: [number, number] | null;
        chosen: number | null;
      };
    };
  };
};

export const driveRemoveOneCpus: CpuDriver = ({ game, cpuPlayerIds, schedule }) => {
  for (const cpuId of cpuPlayerIds) {
    const state = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const removeOne = state?.removeOne;
    if (!removeOne?.me) continue;

    const { phase } = removeOne;
    const priv = removeOne.me.private;

    if (phase === 'selecting' && priv.selection === null) {
      schedule(() => {
        if (priv.hand.length < 2) return;
        const shuffled = [...priv.hand].sort(() => Math.random() - 0.5);
        game.handleAction(cpuId, {
          type: 'remove-one/select-pair',
          payload: { a: shuffled[0], b: shuffled[1] },
        });
      });
    } else if (phase === 'choosing' && priv.chosen === null && priv.selection) {
      schedule(() => {
        const sel = priv.selection!;
        const pick = Math.random() < 0.5 ? sel[0] : sel[1];
        game.handleAction(cpuId, {
          type: 'remove-one/choose-play',
          payload: { card: pick },
        });
      });
    }
  }
};
