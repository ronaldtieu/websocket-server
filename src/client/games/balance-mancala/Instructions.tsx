// phone-friendly rules card for Balance Mancala.

export function BalanceMancalaInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Score evenly across <span className="text-red-400 font-bold">Red</span>,{' '}
          <span className="text-blue-400 font-bold">Blue</span>, and{' '}
          <span className="text-emerald-400 font-bold">Green</span>. Final ={' '}
          <span className="text-white font-bold">min(R,B,G) − (max − min)</span>. Balance wins.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Setup
        </div>
        <p className="text-sm leading-relaxed">
          14 dishes form a ring: 4 Red, 4 Blue, 4 Green plus an{' '}
          <span className="text-white font-bold">Angel</span> (white) and a{' '}
          <span className="text-zinc-500 font-bold">Devil</span> (black). Each player has 4 stones
          to place during the placement phase.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each turn
        </div>
        <ol className="space-y-3">
          {[
            <>Pick a dish that contains <span className="text-white font-bold">at least one of your stones</span>.</>,
            <>Pick up <span className="text-white font-bold">all</span> stones in that dish.</>,
            <>Sow them <span className="text-white font-bold">one per dish, clockwise</span>.</>,
            <>The <span className="text-white font-bold">last stone's owner</span> scores points equal to the final dish's total stone count, in that dish's color.</>,
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
          Special dishes
        </div>
        <p className="text-sm leading-relaxed">
          <span className="text-white font-bold">Angel</span> routes the score to the owner's{' '}
          <span className="text-white font-bold">lowest</span> color.{' '}
          <span className="text-zinc-400 font-bold">Devil</span> routes it to the owner's{' '}
          <span className="text-white font-bold">highest</span> color.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Game end
        </div>
        <p className="text-sm leading-relaxed">
          The game ends the moment any player reaches{' '}
          <span className="text-white font-bold">≥30 in a single color</span>.
        </p>
      </div>
    </div>
  );
}
