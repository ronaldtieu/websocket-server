// Phone-friendly rules card for Crooked Cops.

export function CrookedCopsInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          <span className="text-white font-bold">Thieves</span> roam a subway and grab pieces.{' '}
          <span className="text-white font-bold">Police</span> chase them — but two of the cops are{' '}
          <span className="text-amber-300 font-bold">crooked</span> and secretly helping the thieves.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each round
        </div>
        <ol className="space-y-3">
          {[
            <><span className="text-white font-bold">Thieves move</span> up to 2 stations. Walking through a piece collects it.</>,
            <><span className="text-white font-bold">Cops move</span> 1 station, then either Investigate or Arrest.</>,
            <><span className="text-white font-bold">Investigate</span> tells you privately if a thief passed through your station this round.</>,
            <><span className="text-white font-bold">Arrest</span> works on your station or an adjacent one. A crooked cop's arrest mysteriously fails.</>,
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
          Win conditions
        </div>
        <p className="text-sm leading-relaxed">
          Thieves win at <span className="text-white font-bold">12 pieces</span>. Police win by{' '}
          <span className="text-white font-bold">arresting both thieves</span>. After 15 rounds the
          piece count decides — over 6 favors thieves.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Whistleblower vote
        </div>
        <p className="text-sm leading-relaxed">
          After the game, every police team votes on who they think the crooked cop on{' '}
          <span className="text-white font-bold">their team</span> is. Catch them for a bonus piece.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Radio
        </div>
        <p className="text-sm leading-relaxed">
          Cops chat with their team only. Crooked cops have an extra private feed pinging them when
          thieves move — they may use it to deceive.
        </p>
      </div>
    </div>
  );
}
