/**
 * 手札別の行動確率の推定（プリフロップ）。poker-study/hand_model.py と同じ計算にする。
 *
 * データの手札はショーダウンまで行った人のぶんしか見えず、強い手に偏る。直接は測れないので、
 *   P(レイズ|手) = σ(k(z-θr)),  P(継続|手) = σ(k(z-θc))
 * と置き、その状況の全ハンドの頻度（偏りのない値）を満たすように θ を決める。z は手札の強さ。
 * k=1（最も柔らかい下限）と k=1.5（見えた手札への当てはまり最良）の 2 通りで幅を出す。
 */
import Z from './hand-z.json';
import type { Counts } from './engine';

export const K_LO = 1.0;
export const K_HI = 1.5;

const RK = '23456789TJQKA';
const zTable = Z as Record<string, number>;

/** 2 枚（'Ah', 'Th'）→ 手札クラス（'ATs'）。同じカードは不可 */
export function handClass(a: string, b: string): string {
  let [x, y] = [a, b];
  if (RK.indexOf(x[0]) < RK.indexOf(y[0])) [x, y] = [y, x];
  if (x[0] === y[0]) return `${x[0]}${y[0]}`;
  return `${x[0]}${y[0]}${x[1] === y[1] ? 's' : 'o'}`;
}

const CLASSES = Object.keys(zTable);
const prior = (k: string): number => (k.length === 2 ? 6 : k[2] === 's' ? 4 : 12) / 1326;
const sig = (x: number): number => 1 / (1 + Math.exp(-x));

function theta(k: number, target: number): number {
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = CLASSES.reduce((s, c) => s + prior(c) * sig(k * (zTable[c] - mid)), 0);
    if (v > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** counts（行動コード→回数）の状況で、手札 hand のときに各行動をとる確率 */
export function nodeProbs(counts: Counts, hand: string, k: number): Record<string, number> {
  const N = Object.values(counts).reduce((a, b) => a + b, 0);
  const pass = Object.entries(counts).filter(([c]) => c === 'c' || c === 'x');
  const rais = Object.entries(counts).filter(([c]) => c !== 'f' && c !== 'c' && c !== 'x');
  const pc = pass.reduce((s, [, v]) => s + v, 0) / N;
  const pr = rais.reduce((s, [, v]) => s + v, 0) / N;
  const zh = zTable[hand];
  const R = pr <= 0 ? 0 : pr >= 1 ? 1 : sig(k * (zh - theta(k, pr)));
  let cont = pr + pc >= 1 ? 1 : pc <= 0 ? R : sig(k * (zh - theta(k, pr + pc)));
  cont = Math.max(cont, R);
  const out: Record<string, number> = { f: 1 - cont };
  for (const [c, v] of pass) out[c] = ((cont - R) * v) / (pc * N);
  for (const [c, v] of rais) out[c] = (R * v) / (pr * N);
  return out;
}

export interface HandEstimate {
  lo: number;
  hi: number;
  mid: number;
}

/** 2 通りの仮定での確率を、行動コードごとの幅（lo〜hi）にする */
export function estimate(counts: Counts | null, hand: string, codes: string[]): Record<string, HandEstimate> | null {
  if (!counts || Object.keys(counts).length === 0) return null;
  const a = nodeProbs(counts, hand, K_LO);
  const b = nodeProbs(counts, hand, K_HI);
  const out: Record<string, HandEstimate> = {};
  for (const c of codes) {
    const x = a[c] ?? 0;
    const y = b[c] ?? 0;
    out[c] = { lo: Math.min(x, y), hi: Math.max(x, y), mid: (x + y) / 2 };
  }
  return out;
}
