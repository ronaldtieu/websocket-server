import { useEffect, useState } from 'react';

// renders a shared countdown bar driven by a server-supplied deadline timestamp.
// authoritative clock lives on the server; the client only renders.
export function PhaseTimer({ deadline, label }: { deadline: number | null; label?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadline]);

  if (deadline === null) {
    return (
      <div className="flex items-center gap-3 text-zinc-500">
        {label && <span className="text-[9px] font-bold uppercase tracking-[0.3em]">{label}</span>}
        <span className="text-[9px] font-bold uppercase tracking-[0.3em]">paused</span>
      </div>
    );
  }

  const remaining = Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  // rough percent — we don't know the original duration here, so cap at 30s visual
  const pct = Math.min(100, (remaining / 30_000) * 100);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        {label && <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">{label}</span>}
        <span className="text-[10px] font-bold uppercase tracking-widest text-white font-mono">{seconds}s</span>
      </div>
      <div className="h-[2px] bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
