// action type constants for archduke.
// the full union lives in ./types.ts as ArchdukeAction; this module exposes
// just the string tags so handlers can exhaustive-switch without widening.

export const ARCHDUKE_ACTIONS = {
  ACK_PEEK: 'archduke/ack-peek',
  DRAW: 'archduke/draw',
  DECIDE: 'archduke/decide',
  RESOLVE_ACTION: 'archduke/resolve-action',
  SKIP_ACTION: 'archduke/skip-action',
} as const;
