/**
 * Hidden d20 resolution — CONTEXT: player never sees dice; DC 6/10/14/17/20 scale.
 */
export function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

export function rollD4() {
  return 1 + Math.floor(Math.random() * 4);
}

/**
 * @param {{ dc: number; modifier?: number }} opts
 * @returns {{ total: number; success: boolean; passMargin: number }}
 */
export function resolveAgainstDC({ dc, modifier = 0 }) {
  const roll = rollD20();
  const total = roll + modifier;
  const success = total >= dc;
  return { total, roll, modifier, dc, success, passMargin: total - dc };
}

/**
 * Business-language outcome only (no dice surfaced).
 * @param {{ dc: number; modifier?: number; passSummary?: string; failSummary?: string }} opts
 */
export function resolveNarrative(opts) {
  const r = resolveAgainstDC(opts);
  const pass =
    opts.passSummary ?? 'The request was approved without further conditions.';
  const fail =
    opts.failSummary ?? 'The request was declined. Further documentation may be required.';
  return {
    success: r.success,
    message: r.success ? pass : fail,
    _internal: r
  };
}
