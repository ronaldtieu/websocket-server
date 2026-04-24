// Phone-friendly rules card for "Unknown".
// IMPORTANT: do NOT spoil the hidden rules. Only the public mechanics
// (tumble, goal, practice phase) are explained here.

export function CubeBoardInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Be the first to reach the <span className="text-white font-bold">black square</span>{' '}
          in the center of the board.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each turn
        </div>
        <ol className="space-y-3">
          {[
            <>You have a <span className="text-white font-bold">cube</span> with a different color on each side. Only the top face is public.</>,
            <>Tip the cube one square <span className="text-white font-bold">North, East, South, or West</span>. The cube tumbles — a new color rises to the top.</>,
            <>If your destination has another player&rsquo;s cube, that cube is{' '}
              <span className="text-white font-bold">pushed</span> one square in the same direction and tumbles too.</>,
            <>Use the preview swatches on the move buttons to plan your tumble.</>,
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
          Practice phase
        </div>
        <p className="text-sm leading-relaxed">
          The first <span className="text-white font-bold">three rounds</span> are practice.
          Things may happen that you don&rsquo;t understand — that&rsquo;s the game working as
          intended. After the practice phase ends, the table will start announcing
          discovered rules as players trigger them.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Notes
        </div>
        <p className="text-sm leading-relaxed">
          You have a private notes pad on your phone. Use it to record your
          guesses about how things work — your hypotheses are part of the game.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Ranking
        </div>
        <p className="text-sm leading-relaxed">
          First to the goal wins. Everyone else is ranked by the number printed
          on their final square — higher is better.
        </p>
      </div>
    </div>
  );
}
