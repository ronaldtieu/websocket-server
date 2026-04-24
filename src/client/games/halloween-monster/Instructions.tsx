// phone-friendly rules card for Halloween Monster.
// Intentionally short — enough to onboard a new player.

export function HalloweenMonsterInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Hunt monsters, hoard <span className="text-orange-300 font-bold">Victory Points</span>,
          and survive the Hidden Twist.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Setup
        </div>
        <p className="text-sm leading-relaxed">
          Everyone starts with <span className="text-white font-bold">5 VP</span> and{' '}
          <span className="text-white font-bold">1 Dagger</span> (3 dmg, reusable). Pre-game you
          may form an <span className="text-orange-300 font-bold">alliance</span> (max 3) and
          transfer VP.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each round
        </div>
        <ol className="space-y-3">
          {[
            <>Players act in <span className="text-white font-bold">VP-descending</span> order.</>,
            <>On your turn, pick <span className="text-white font-bold">one weapon</span> and one target.</>,
            <>Defeat a monster → claim its <span className="text-orange-300 font-bold">VP + loot</span>.</>,
            <>Optional shop step at the end of the round (Scouter, Change Order).</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-black flex items-center justify-center font-black text-[10px]">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Weapons
        </div>
        <ul className="text-sm space-y-1 list-disc list-inside text-zinc-300">
          <li>Dagger — 3 dmg, reusable</li>
          <li>Poison — 1 dmg/round (DoT)</li>
          <li>Ice — 3 dmg, freezes</li>
          <li>Dual Swords — 4, or split 2+2</li>
          <li>Grenade — 6 dmg</li>
          <li>Dynamite — 10 delayed</li>
        </ul>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Hidden Twist
        </div>
        <p className="text-sm leading-relaxed">
          The double-bordered slot in the lineup is a{' '}
          <span className="text-orange-300 font-bold">player-target</span>. You may attack a
          fellow player instead of a monster. Killing one steals their VP and weapons. The twist
          is revealed to the table the first time anyone tries it.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Win
        </div>
        <p className="text-sm leading-relaxed">
          The hunt ends when <span className="text-white font-bold">all reserve monsters are dead</span> or
          the host calls time. Highest VP wins.
        </p>
      </div>
    </div>
  );
}
