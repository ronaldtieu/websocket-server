// phone-friendly rules card for Archduke.
// covers the minimum a new player needs; pairs with the MainScreen / Phone UI.

export function ArchdukeInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          End each round with the <span className="text-white font-bold">lowest</span> set value.
          Lowest total score across rounds wins. The <span className="text-white font-bold">Archduke (-3)</span> is
          the best card to hold.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Setup
        </div>
        <p className="text-sm leading-relaxed">
          Each player gets 4 face-down cards as their "set". At the start of a round, you peek at your
          two bottom cards. Memorize them.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Your turn
        </div>
        <ol className="space-y-3">
          {[
            <><span className="text-white font-bold">Draw</span> one card from the pile.</>,
            <>Choose: <span className="text-white font-bold">swap</span> it into one of your slots (the replaced card is discarded), <span className="text-white font-bold">discard</span> it immediately, or <span className="text-white font-bold">match</span> it with a set card of equal value/symbol to dump both.</>,
            <>If the discarded or matched card is a <span className="text-white font-bold">face card</span>, its action triggers.</>,
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
          Face cards
        </div>
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <span className="text-cyan-300 font-bold">PEEK</span>: look at one card on the table (yours or
            anyone's).
          </li>
          <li>
            <span className="text-cyan-300 font-bold">GIVE</span>: pull a penalty card from the deck and
            add it to another player's set (unseen).
          </li>
          <li>
            <span className="text-cyan-300 font-bold">SWAP</span>: swap two slots on the table — blind,
            no one sees the result.
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Matching
        </div>
        <p className="text-sm leading-relaxed">
          Number cards match by <span className="text-white font-bold">value</span>. Face cards match by{' '}
          <span className="text-white font-bold">suit</span>. Eclipse cards all match each other. The Archduke never
          matches.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Round end
        </div>
        <p className="text-sm leading-relaxed">
          After a set number of turns, every set reveals. Face cards count 0. Eclipse cards are 0 or 13.
          The Archduke is -3. Lowest set value wins the round; totals accumulate.
        </p>
      </div>
    </div>
  );
}
