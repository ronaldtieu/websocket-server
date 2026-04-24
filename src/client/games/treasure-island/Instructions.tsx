// Treasure Island — public rules only.
// IMPORTANT: do NOT mention the diagonal/3D placement rule. That's a hidden
// rule discovered through play and announced via the in-game rule log.

export function TreasureIslandInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Bid for arrows, place them as a path across the island, and find the{' '}
          <span className="text-white font-bold">Treasure Chest</span> hidden inside one of the ten
          boxes. Open boxes for VP and private hints along the way.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Rounds
        </div>
        <ol className="space-y-3">
          {[
            <>
              The game runs <span className="text-white font-bold">9 rounds</span>. Rounds 1, 2, 3,
              5, and 7 are <span className="text-white font-bold">auctions</span>; rounds 4, 6, 8,
              and 9 are <span className="text-white font-bold">explorations</span>.
            </>,
            <>
              In an auction, you allocate <span className="text-white font-bold">chips</span>{' '}
              across the offered arrows (sealed bids — minimum 1 chip per arrow).
            </>,
            <>
              In exploration, place your arrows on the board.{' '}
              <span className="text-white font-bold">Each arrow must start and end at a red dot.</span>
            </>,
            <>
              The first player to walk through a box opens it: gains VP and a{' '}
              <span className="text-white font-bold">private hint</span> about the treasure.
            </>,
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
          Pieces
        </div>
        <p className="text-sm leading-relaxed">
          Spend <span className="text-white font-bold">1 Piece</span> at any time to peek inside an
          unopened box. You see what's there but don't claim it. Find the treasure to{' '}
          <span className="text-white font-bold">steal 4 Pieces</span> from other players.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Scoring
        </div>
        <ul className="text-sm leading-relaxed space-y-1">
          <li>
            <span className="text-white font-bold">≥ 41 VP</span> → +2 Pieces
          </li>
          <li>
            <span className="text-white font-bold">31–40 VP</span> → +1 Piece
          </li>
          <li>
            <span className="text-white font-bold">21–30 VP</span> → 0
          </li>
          <li>
            <span className="text-white font-bold">11–20 VP</span> → −1 Piece
          </li>
          <li>
            <span className="text-white font-bold">≤ 10 VP</span> → −2 Pieces
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Hidden tricks
        </div>
        <p className="text-sm leading-relaxed">
          Some rules aren't written down. Watch the rule log on the main screen — they get
          revealed once a player discovers them.
        </p>
      </div>
    </div>
  );
}
