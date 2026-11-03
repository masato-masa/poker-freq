/**
 * 7 枚の役の評価と、ボード上の手札の強さ(S)。poker-study/hand_eval.py と同じ計算にする。
 *
 * カードは整数 id = ランク*4 + スート (ランク 0..12 = 2..A, スート 0..3 = s h d c)。
 * S(手札) = ランダムな相手の手に勝つ確率(引き分けは半分)。残りのカードの出方(ランアウト)で平均する。
 *   フロップ: 2 枚の出方のうち 14 個おき  ターン: 残りの全部  リバー: 1 通り
 */

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const STRIDE = 14;

export const cardId = (card: string): number => RANKS.indexOf(card[0]) * 4 + SUITS.indexOf(card[1]);

function straightHigh(mask: number): number {
  const ext = (mask << 1) | (mask & (1 << 12) ? 1 : 0);
  for (let high = 13; high >= 4; high--) {
    if (((ext >> (high - 4)) & 31) === 31) return high - 1;
  }
  return -1;
}

const rc = new Int32Array(13);
const sc = new Int32Array(4);
const sm = new Int32Array(4);

/** 2〜7 枚のうち最良の 5 枚の強さ（大きいほど強い）。引き分けは同じ値 */
export function evaluate(cs: ArrayLike<number>): number {
  rc.fill(0);
  sc.fill(0);
  sm.fill(0);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const r = c >> 2;
    const s = c & 3;
    rc[r]++;
    sc[s]++;
    sm[s] |= 1 << r;
  }
  let flush = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flush = s;
  if (flush >= 0) {
    const sf = straightHigh(sm[flush]);
    if (sf >= 0) return (8 << 20) | (sf << 16);
  }
  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  const present: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4 && quad < 0) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
    if (rc[r] > 0) present.push(r);
  }
  if (quad >= 0) {
    const k = present.find((r) => r !== quad) as number;
    return (7 << 20) | (quad << 16) | (k << 12);
  }
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const rest = [...trips.slice(1), ...pairs];
    return (6 << 20) | (trips[0] << 16) | (Math.max(...rest) << 12);
  }
  if (flush >= 0) {
    let v = 5 << 20;
    let i = 0;
    for (let r = 12; r >= 0 && i < 5; r--) {
      if ((sm[flush] >> r) & 1) {
        v |= r << (16 - 4 * i);
        i++;
      }
    }
    return v;
  }
  let mask = 0;
  for (const r of present) mask |= 1 << r;
  const st = straightHigh(mask);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (trips.length > 0) {
    const t = trips[0];
    const ks = present.filter((r) => r !== t).slice(0, 2);
    return (3 << 20) | (t << 16) | (ks[0] << 12) | (ks[1] << 8);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const k = present.find((r) => r !== p1 && r !== p2) as number;
    return (2 << 20) | (p1 << 16) | (p2 << 12) | (k << 8);
  }
  if (pairs.length === 1) {
    const p = pairs[0];
    const ks = present.filter((r) => r !== p).slice(0, 3);
    return (1 << 20) | (p << 16) | (ks[0] << 12) | (ks[1] << 8) | (ks[2] << 4);
  }
  let v = 0;
  for (let i = 0; i < 5; i++) v |= present[i] << (16 - 4 * i);
  return v;
}

export interface Strengths {
  /** ボードと重ならない 2 枚の組（デッキ順、a<b） */
  combos: [number, number][];
  S: Float64Array;
  /** 組 (a,b) の位置。key = a*52+b */
  index: Map<number, number>;
}

const lowerBound = (arr: Int32Array, v: number): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const upperBound = (arr: Int32Array, v: number): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const cache = new Map<string, Strengths>();

export function strengths(board: number[]): Strengths {
  const key = [...board].sort((a, b) => a - b).join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const used = new Set(board);
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const combos: [number, number][] = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) combos.push([deck[i], deck[j]]);
  const need = 5 - board.length;
  let runs: number[][];
  if (need === 0) runs = [[]];
  else if (need === 1) runs = deck.map((c) => [c]);
  else {
    runs = [];
    let n = 0;
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        if (n % STRIDE === 0) runs.push([deck[i], deck[j]]);
        n++;
      }
    }
  }
  const acc = new Float64Array(combos.length);
  const cnt = new Int32Array(combos.length);
  const hand = new Array<number>(7);
  for (const r of runs) {
    const fb = [...board, ...r];
    const idx: number[] = [];
    const ranks: number[] = [];
    for (let k = 0; k < combos.length; k++) {
      const [a, b] = combos[k];
      if (r.includes(a) || r.includes(b)) continue;
      hand.length = 0;
      hand.push(a, b, ...fb);
      idx.push(k);
      ranks.push(evaluate(hand));
    }
    const srt = Int32Array.from(ranks).sort();
    const m = ranks.length;
    for (let t = 0; t < idx.length; t++) {
      const v = ranks[t];
      const less = lowerBound(srt, v);
      const eq = upperBound(srt, v) - less;
      acc[idx[t]] += (less + 0.5 * (eq - 1)) / (m - 1);
      cnt[idx[t]]++;
    }
  }
  const S = new Float64Array(combos.length);
  for (let k = 0; k < combos.length; k++) S[k] = acc[k] / cnt[k];
  const index = new Map<number, number>();
  combos.forEach(([a, b], i) => index.set(a * 52 + b, i));
  const out = { combos, S, index };
  cache.set(key, out);
  return out;
}
