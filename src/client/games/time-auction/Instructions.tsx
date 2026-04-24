// phone-friendly rules card for Time Auction.
// kept intentionally short — enough to onboard a new player, not exhaustive.

export function TimeAuctionInstructions() {
  return (
    <div className="space-y-8 text-zinc-300">
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Objective
        </div>
        <p className="text-sm leading-relaxed">
          Win the most <span className="text-white font-bold">Tokens</span> by bidding cleverly with
          your <span className="text-white font-bold">Time Bank</span>. Spend too freely and you
          run dry; bid too cautiously and someone else takes the prize.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Each round
        </div>
        <ol className="space-y-3">
          {[
            <>A 5-second <span className="text-white font-bold">countdown</span> opens the round.</>,
            <>Hold the big <span className="text-white font-bold">"HOLD TO BID"</span> button. Your Time Bank drains while you hold.</>,
            <><span className="text-white font-bold">Release</span> to lock in your bid at the elapsed duration.</>,
            <>Highest bid wins the <span className="text-white font-bold">Token</span>. Ties broken by who has more bank left.</>,
            <>The winner is announced — <span className="text-white font-bold">losing bids stay secret</span>.</>,
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
          Time Bank
        </div>
        <p className="text-sm leading-relaxed">
          You start with <span className="text-white font-bold">600 seconds</span> for the whole game.
          When it hits zero you can no longer bid — so pace yourself.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          End of game
        </div>
        <p className="text-sm leading-relaxed">
          After <span className="text-white font-bold">19 rounds</span>, the player with the most
          tokens wins a Piece. The fewest is eliminated from the session.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Bluffing
        </div>
        <p className="text-sm leading-relaxed">
          Other players can see <span className="text-white font-bold">whether</span> you're holding —
          but never <span className="text-white font-bold">how long</span>. Use that.
        </p>
      </div>
    </div>
  );
}
