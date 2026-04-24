import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';

type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export type PixelCardTone =
  | 'default'
  | 'selected'
  | 'winner'
  | 'clashed'
  | 'locked'
  | 'discarded';
type PixelCardSize = 'sm' | 'md' | 'lg';

const SUIT_ORDER: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

const SUIT_LABELS: Record<Suit, string> = {
  spades: 'Spades',
  hearts: 'Hearts',
  clubs: 'Clubs',
  diamonds: 'Diamonds',
};

const SUIT_PATTERNS: Record<Suit, string[]> = {
  spades: [
    '0001000',
    '0011100',
    '0111110',
    '1111111',
    '1111111',
    '0011100',
    '0011100',
  ],
  hearts: [
    '0110110',
    '1111111',
    '1111111',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ],
  clubs: [
    '0001000',
    '0011100',
    '0111110',
    '0011100',
    '1111111',
    '0011100',
    '0011100',
  ],
  diamonds: [
    '0001000',
    '0011100',
    '0111110',
    '1111111',
    '0111110',
    '0011100',
    '0001000',
  ],
};

const CARD_PATTERN_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(17,17,17,0.05) 0 4px, transparent 4px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px)',
};

const CLASH_PATTERN_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 4px, transparent 4px 8px), linear-gradient(180deg, rgba(251,113,133,0.18), rgba(17,17,17,0))',
};

const CARD_BACK_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px)',
};

const SIZE_CONFIG: Record<
  PixelCardSize,
  {
    padding: string;
    cornerText: string;
    centerText: string;
    footerText: string;
    badgeText: string;
    accentSquare: string;
    cornerPixel: number;
    centerPixel: number;
  }
> = {
  sm: {
    padding: 'p-1.5',
    cornerText: 'text-[8px]',
    centerText: 'text-2xl',
    footerText: 'text-[6px]',
    badgeText: 'text-[6px]',
    accentSquare: 'h-1.5 w-1.5',
    cornerPixel: 1,
    centerPixel: 2,
  },
  md: {
    padding: 'p-2',
    cornerText: 'text-[10px]',
    centerText: 'text-4xl',
    footerText: 'text-[7px]',
    badgeText: 'text-[7px]',
    accentSquare: 'h-2 w-2',
    cornerPixel: 2,
    centerPixel: 3,
  },
  lg: {
    padding: 'p-3',
    cornerText: 'text-xs',
    centerText: 'text-6xl',
    footerText: 'text-[8px]',
    badgeText: 'text-[8px]',
    accentSquare: 'h-2.5 w-2.5',
    cornerPixel: 2,
    centerPixel: 4,
  },
};

const TONE_CONFIG: Record<
  PixelCardTone,
  {
    surface: string;
    frame: string;
    accent: string;
    footer: string;
    badge: string;
  }
> = {
  default: {
    surface:
      'bg-[#f6e8c7] text-[#151515] border-[#151515] shadow-[5px_5px_0_rgba(0,0,0,0.35)]',
    frame: 'border-black/10',
    accent: 'border-black/10 bg-black/10',
    footer: 'bg-black/10 text-[#2a2a2a]',
    badge: 'bg-black text-white border border-black/10',
  },
  selected: {
    surface:
      'bg-[#fff7de] text-[#111111] border-white shadow-[0_0_0_2px_rgba(255,255,255,0.22),6px_6px_0_rgba(255,255,255,0.12)]',
    frame: 'border-black/10',
    accent: 'border-black/10 bg-black/10',
    footer: 'bg-black/10 text-[#1f1f1f]',
    badge: 'bg-black text-white border border-black/10',
  },
  winner: {
    surface:
      'bg-[#fffdf2] text-[#101010] border-white shadow-[0_0_0_2px_rgba(255,255,255,0.30),8px_8px_0_rgba(255,255,255,0.16)]',
    frame: 'border-black/10',
    accent: 'border-black/10 bg-black/10',
    footer: 'bg-black/10 text-[#1f1f1f]',
    badge: 'bg-white text-black border border-black/10',
  },
  clashed: {
    surface:
      'bg-[#2a1717] text-[#f6e5dc] border-[#fb7185] shadow-[5px_5px_0_rgba(0,0,0,0.40)]',
    frame: 'border-white/10',
    accent: 'border-white/10 bg-white/10',
    footer: 'bg-black/25 text-[#f3d5ce]',
    badge: 'bg-rose-300 text-black border border-rose-100/30',
  },
  locked: {
    surface:
      'bg-[#ddd4b6] text-[#232323] border-[#484848] shadow-[5px_5px_0_rgba(0,0,0,0.20)] opacity-65 grayscale',
    frame: 'border-black/10',
    accent: 'border-black/10 bg-black/10',
    footer: 'bg-black/10 text-[#2a2a2a]',
    badge: 'bg-black text-white border border-black/10',
  },
  discarded: {
    surface:
      'bg-[#c8c0a7] text-[#232323] border-[#484848] shadow-[4px_4px_0_rgba(0,0,0,0.15)] opacity-25 grayscale',
    frame: 'border-black/10',
    accent: 'border-black/10 bg-black/10',
    footer: 'bg-black/10 text-[#2a2a2a]',
    badge: 'bg-black text-white border border-black/10',
  },
};

function patternToCells(pattern: string[]): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  pattern.forEach((row, y) => {
    row.split('').forEach((cell, x) => {
      if (cell === '1') cells.push([x, y]);
    });
  });
  return cells;
}

const SUIT_CELLS = (Object.entries(SUIT_PATTERNS) as Array<[Suit, string[]]>).reduce(
  (acc, [suit, pattern]) => {
    acc[suit] = patternToCells(pattern);
    return acc;
  },
  {} as Record<Suit, Array<[number, number]>>,
);

export function getPlayingCardFace(value: number) {
  const normalizedValue = Math.max(1, Math.trunc(value));
  const suit = SUIT_ORDER[(normalizedValue - 1) % SUIT_ORDER.length];

  return {
    rank: String(normalizedValue),
    suit,
    suitLabel: SUIT_LABELS[suit],
    isRedSuit: suit === 'hearts' || suit === 'diamonds',
  };
}

function PixelSuit({
  suit,
  pixelSize,
  className,
}: {
  suit: Suit;
  pixelSize: number;
  className?: string;
}) {
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(7, ${pixelSize}px)`,
    gridTemplateRows: `repeat(7, ${pixelSize}px)`,
    width: `${pixelSize * 7}px`,
    height: `${pixelSize * 7}px`,
  };

  return (
    <div aria-hidden className={cn('grid shrink-0', className)} style={style}>
      {SUIT_CELLS[suit].map(([x, y], index) => (
        <span
          key={`${suit}-${index}`}
          className="block bg-current"
          style={{ gridColumn: x + 1, gridRow: y + 1 }}
        />
      ))}
    </div>
  );
}

export function PixelPlayingCard({
  value,
  tone = 'default',
  size = 'md',
  badge,
  footerLabel,
  className,
}: {
  value: number;
  tone?: PixelCardTone;
  size?: PixelCardSize;
  badge?: string;
  footerLabel?: string;
  className?: string;
}) {
  const face = getPlayingCardFace(value);
  const sizing = SIZE_CONFIG[size];
  const toneConfig = TONE_CONFIG[tone];
  const suitTone =
    tone === 'clashed'
      ? face.isRedSuit
        ? 'text-rose-300'
        : 'text-zinc-100'
      : face.isRedSuit
        ? 'text-[#bf3a2b]'
        : 'text-[#111111]';

  return (
    <div
      aria-label={`${face.rank} of ${face.suitLabel}`}
      className={cn(
        'relative isolate h-full w-full overflow-hidden rounded-[4px] border-[3px] font-mono',
        sizing.padding,
        toneConfig.surface,
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-35 pointer-events-none"
        style={tone === 'clashed' ? CLASH_PATTERN_STYLE : CARD_PATTERN_STYLE}
      />
      <div className={cn('absolute inset-[5px] border pointer-events-none', toneConfig.frame)} />
      <div className="absolute inset-x-0 top-0 h-1 bg-white/35 pointer-events-none" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex flex-col items-start gap-0.5 leading-none">
            <span className={cn('font-black tracking-[-0.08em]', sizing.cornerText)}>{face.rank}</span>
            <PixelSuit suit={face.suit} pixelSize={sizing.cornerPixel} className={suitTone} />
          </div>
          <div className={cn('border shrink-0', sizing.accentSquare, toneConfig.accent)} />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <span className={cn('font-black leading-none tracking-[-0.14em]', sizing.centerText)}>
            {face.rank}
          </span>
          <PixelSuit suit={face.suit} pixelSize={sizing.centerPixel} className={suitTone} />
        </div>

        <div className="flex items-end justify-between">
          <div className={cn('border shrink-0', sizing.accentSquare, toneConfig.accent)} />
          <div className="flex rotate-180 flex-col items-start gap-0.5 leading-none">
            <span className={cn('font-black tracking-[-0.08em]', sizing.cornerText)}>{face.rank}</span>
            <PixelSuit suit={face.suit} pixelSize={sizing.cornerPixel} className={suitTone} />
          </div>
        </div>
      </div>

      {tone === 'clashed' && (
        <div className="pointer-events-none absolute inset-x-3 top-1/2 h-[3px] -translate-y-1/2 bg-rose-300/85" />
      )}

      {badge && (
        <span
          className={cn(
            'absolute -top-2 -right-1 px-2 py-0.5 rounded-sm font-black uppercase tracking-[0.25em]',
            sizing.badgeText,
            toneConfig.badge,
          )}
        >
          {badge}
        </span>
      )}

      {footerLabel && (
        <span
          className={cn(
            'absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm px-1.5 py-0.5 font-black uppercase tracking-[0.22em]',
            sizing.footerText,
            toneConfig.footer,
          )}
        >
          {footerLabel}
        </span>
      )}
    </div>
  );
}

export function PixelCardBack({
  size = 'sm',
  footerLabel = 'hidden',
  className,
}: {
  size?: PixelCardSize;
  footerLabel?: string;
  className?: string;
}) {
  const sizing = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        'relative isolate h-full w-full overflow-hidden rounded-[4px] border-[3px] border-white/10 bg-zinc-950 text-zinc-400 shadow-[4px_4px_0_rgba(0,0,0,0.32)]',
        sizing.padding,
        className,
      )}
    >
      <div className="absolute inset-0 opacity-40 pointer-events-none" style={CARD_BACK_STYLE} />
      <div className="absolute inset-[5px] border border-white/10 pointer-events-none" />
      <div className="relative z-10 flex h-full items-center justify-center">
        <PixelSuit suit="spades" pixelSize={sizing.centerPixel} className="text-zinc-500" />
      </div>
      <span
        className={cn(
          'absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm bg-black/30 px-1.5 py-0.5 font-black uppercase tracking-[0.22em] text-zinc-500',
          sizing.footerText,
        )}
      >
        {footerLabel}
      </span>
    </div>
  );
}
