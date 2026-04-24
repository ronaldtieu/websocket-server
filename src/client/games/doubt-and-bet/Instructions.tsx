// phone-friendly rules card for Doubt and Bet.

import { COLOR_HEX, COLOR_LABEL, ALL_COLORS } from './types';

export function DoubtAndBetInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Bluff a Liar's-Dice claim about cards on the table. Your{' '}
          <span className="text-white font-bold">clockwise neighbor</span> must Raise or Doubt.
          Survive longer than the other players.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each round
        </div>
        <ol className="space-y-3">
          {[
            <>Each player gets a fresh hand of cards (one per slot).</>,
            <>Active player <span className="text-white font-bold">claims</span>: "≥ N cards of color X across the whole table."</>,
            <>Neighbor must <span className="text-white font-bold">Raise</span> (higher N, or stricter color) or <span className="text-white font-bold">Doubt</span>.</>,
            <>On Doubt: all cards reveal. Rainbows count as the claimed color.</>,
            <>Loser pays 1 piece + permanently loses 1 slot.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-black text-[10px]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Color rank (raises)
        </div>
        <div className="flex items-center gap-2">
          {ALL_COLORS.map((c, i) => (
            <span key={c} className="flex items-center gap-1">
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: COLOR_HEX[c] }}
              />
              <span className="text-[10px] font-bold uppercase">{COLOR_LABEL[c]}</span>
              {i < ALL_COLORS.length - 1 && <span className="text-zinc-600">{'<'}</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Raise N (any color) OR keep N and pick a stricter color.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Attrition
        </div>
        <p className="text-sm leading-relaxed">
          Every <span className="text-white font-bold">5 rounds</span> everyone pays 1 piece.
          Every <span className="text-white font-bold">10 rounds</span> seats rotate.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Buy a slot back
        </div>
        <p className="text-sm leading-relaxed">
          Between rounds, spend <span className="text-white font-bold">1 piece</span> to add a slot back (max 5).
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Elimination
        </div>
        <p className="text-sm leading-relaxed">
          Reach <span className="text-white font-bold">0 pieces</span> or <span className="text-white font-bold">0 slots</span> and you're out.
          Game ends at 2 eliminations. Top survivor gets +2 pieces.
        </p>
      </div>
    </div>
  );
}
