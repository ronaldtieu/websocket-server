// phone-friendly rules card for Remove One.
// kept intentionally short — enough to onboard a new player, not exhaustive.

export function RemoveOneInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Play the <span className="text-white font-bold">smallest number that no one else plays</span>.
          Bluff your hand, dodge clashes, and win the round.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each round
        </div>
        <ol className="space-y-3">
          {[
            <><span className="text-white font-bold">Select two cards</span> from your hand (you hold 1–8).</>,
            <>Both flip up as a <span className="text-white font-bold">peek</span> — the whole table sees your two candidates.</>,
            <><span className="text-white font-bold">Choose one</span> of your two to actually play.</>,
            <>All played cards <span className="text-white font-bold">flip at once</span>.</>,
            <>Whoever played the smallest <span className="text-white font-bold">unique</span> number wins the round and scores that many points + 1 Victory Token.</>,
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
          Clash rule
        </div>
        <p className="text-sm leading-relaxed">
          If two players play the <span className="text-white font-bold">same number</span>, those cards cancel.
          They don't score — even if they'd be the lowest.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Locked cards
        </div>
        <p className="text-sm leading-relaxed">
          The card you peeked but didn't play is <span className="text-white font-bold">locked out next round</span>.
          You can't use it again until the round after.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Survival
        </div>
        <p className="text-sm leading-relaxed">
          At checkpoints, Victory Tokens count as bonus points. The lowest-scoring
          player who hasn't been made safe yet is <span className="text-white font-bold">eliminated</span> at the end.
        </p>
      </div>
    </div>
  );
}
