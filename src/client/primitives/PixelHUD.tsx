import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/utils';

export type PixelTone = 'cyan' | 'amber' | 'rose' | 'emerald' | 'slate';

const PIXEL_TONES: Record<
  PixelTone,
  {
    panel: string;
    inner: string;
    badge: string;
    buttonSolid: string;
    buttonGhost: string;
    meterOn: string;
    meterOff: string;
    accentText: string;
  }
> = {
  cyan: {
    panel:
      'border-cyan-300/70 bg-[#08141a] text-cyan-50 shadow-[6px_6px_0_rgba(0,0,0,0.35),0_0_24px_rgba(34,211,238,0.08)]',
    inner: 'border-cyan-300/20',
    badge: 'border-cyan-200/35 bg-[#9cecff] text-[#06202a]',
    buttonSolid: 'border-cyan-100 bg-[#9cecff] text-[#06161d] hover:bg-white',
    buttonGhost: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/16',
    meterOn: 'border-cyan-100/35 bg-[#9cecff]',
    meterOff: 'border-cyan-950 bg-[#0b222a]',
    accentText: 'text-cyan-200',
  },
  amber: {
    panel:
      'border-amber-300/75 bg-[#181006] text-amber-50 shadow-[6px_6px_0_rgba(0,0,0,0.35),0_0_24px_rgba(245,158,11,0.08)]',
    inner: 'border-amber-300/20',
    badge: 'border-amber-100/35 bg-[#ffd36e] text-[#261802]',
    buttonSolid: 'border-amber-100 bg-[#ffd36e] text-[#251700] hover:bg-[#ffe4a6]',
    buttonGhost: 'border-amber-300/35 bg-amber-300/10 text-amber-50 hover:bg-amber-300/16',
    meterOn: 'border-amber-100/35 bg-[#ffd36e]',
    meterOff: 'border-amber-950 bg-[#2a1a05]',
    accentText: 'text-amber-200',
  },
  rose: {
    panel:
      'border-rose-300/75 bg-[#18080d] text-rose-50 shadow-[6px_6px_0_rgba(0,0,0,0.35),0_0_24px_rgba(251,113,133,0.08)]',
    inner: 'border-rose-300/20',
    badge: 'border-rose-100/35 bg-[#ff9cad] text-[#26040b]',
    buttonSolid: 'border-rose-100 bg-[#ff9cad] text-[#2b0610] hover:bg-[#ffd0d7]',
    buttonGhost: 'border-rose-300/35 bg-rose-300/10 text-rose-50 hover:bg-rose-300/16',
    meterOn: 'border-rose-100/35 bg-[#ff9cad]',
    meterOff: 'border-rose-950 bg-[#271018]',
    accentText: 'text-rose-200',
  },
  emerald: {
    panel:
      'border-emerald-300/75 bg-[#07160f] text-emerald-50 shadow-[6px_6px_0_rgba(0,0,0,0.35),0_0_24px_rgba(52,211,153,0.08)]',
    inner: 'border-emerald-300/20',
    badge: 'border-emerald-100/35 bg-[#7af0bd] text-[#052015]',
    buttonSolid: 'border-emerald-100 bg-[#7af0bd] text-[#032115] hover:bg-[#a5ffd6]',
    buttonGhost: 'border-emerald-300/35 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/16',
    meterOn: 'border-emerald-100/35 bg-[#7af0bd]',
    meterOff: 'border-emerald-950 bg-[#0b251a]',
    accentText: 'text-emerald-200',
  },
  slate: {
    panel:
      'border-zinc-300/30 bg-[#101015] text-zinc-100 shadow-[6px_6px_0_rgba(0,0,0,0.35)]',
    inner: 'border-white/8',
    badge: 'border-white/12 bg-white text-black',
    buttonSolid: 'border-white bg-white text-black hover:bg-zinc-200',
    buttonGhost: 'border-white/15 bg-white/6 text-white hover:bg-white/10',
    meterOn: 'border-white/20 bg-white',
    meterOff: 'border-zinc-900 bg-[#18181f]',
    accentText: 'text-zinc-300',
  },
};

export const PIXEL_GRID_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 8px)',
};

export function PixelPanel({
  tone = 'slate',
  title,
  subtitle,
  meta,
  className,
  children,
}: {
  tone?: PixelTone;
  title?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const palette = PIXEL_TONES[tone];

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[6px] border-[3px] px-4 py-3 sm:px-5 sm:py-4',
        palette.panel,
        className,
      )}
    >
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <div className={cn('absolute inset-[6px] border pointer-events-none', palette.inner)} />
      {(title || subtitle || meta) && (
        <div className="relative z-10 mb-3 flex items-start justify-between gap-3">
          <div className="space-y-1">
            {title && (
              <div className="text-[10px] font-black uppercase tracking-[0.34em]">
                {title}
              </div>
            )}
            {subtitle && (
              <div className={cn('text-[11px] uppercase tracking-[0.18em]', palette.accentText)}>
                {subtitle}
              </div>
            )}
          </div>
          {meta && <div className="shrink-0">{meta}</div>}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function PixelBadge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: PixelTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border px-2 py-1 text-[9px] font-black uppercase tracking-[0.28em] shadow-[2px_2px_0_rgba(0,0,0,0.25)]',
        PIXEL_TONES[tone].badge,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PixelButton({
  tone = 'slate',
  variant = 'solid',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: PixelTone;
  variant?: 'solid' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  const palette = PIXEL_TONES[tone];
  const sizes = {
    sm: 'px-3 py-2 text-[9px]',
    md: 'px-4 py-2.5 text-[10px]',
    lg: 'px-5 py-3 text-xs',
  };

  return (
    <button
      {...props}
      className={cn(
        'relative overflow-hidden rounded-[6px] border-[3px] font-black uppercase tracking-[0.28em] shadow-[4px_4px_0_rgba(0,0,0,0.35)] transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed',
        sizes[size],
        variant === 'solid' ? palette.buttonSolid : palette.buttonGhost,
        className,
      )}
    >
      <span className="absolute inset-0 opacity-20 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function PixelMeter({
  value,
  max,
  blocks = 12,
  tone = 'slate',
  label,
  valueLabel,
  className,
}: {
  value: number;
  max: number;
  blocks?: number;
  tone?: PixelTone;
  label?: ReactNode;
  valueLabel?: ReactNode;
  className?: string;
}) {
  const palette = PIXEL_TONES[tone];
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const activeBlocks = Math.round(ratio * blocks);

  return (
    <div className={cn('space-y-2', className)}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between gap-3">
          {label && (
            <span className={cn('text-[9px] font-black uppercase tracking-[0.26em]', palette.accentText)}>
              {label}
            </span>
          )}
          {valueLabel && (
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-1">
        {Array.from({ length: blocks }).map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-3 flex-1 border',
              index < activeBlocks ? palette.meterOn : palette.meterOff,
            )}
          />
        ))}
      </div>
    </div>
  );
}
