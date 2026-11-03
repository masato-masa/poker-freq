/** 割合の表示（0〜1 → 文字列） */
export const pct = (x: number): string =>
  x > 0 && x < 0.001 ? '<0.1%' : `${(100 * x).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;

/** 手札別の推定の表示を、範囲(lo〜hi)で */
export function rangeText(lo: number, hi: number): string {
  const f = (x: number) => Math.round(100 * x);
  if (hi < 0.005) return '0%';
  if (hi < 0.01) return '<1%';
  return f(lo) === f(hi) ? `${f(hi)}%` : `${f(lo)}〜${f(hi)}%`;
}
