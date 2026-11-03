/**
 * ポストフロップの手札別推定。poker-study/post_hand_model.py と同じ計算にする。
 *
 * その席が、ここまでに選んだ行動（プリフロップ・前の街）のたびに、その行動を選びそうな手へ重み w を寄せ、
 * 今の場面の全員の頻度に合うようにしきい値を決めて、手札の確率を出す。強さ z = logit(S)。
 */
import type { Counts } from './engine';
import { classOfIds, theta as thetaPre, zTable } from './hand';
import { strengths } from './strength';

export interface PreEv {
  kind: 'pre';
  counts: Counts | null;
  code: string;
}
export interface PostEv {
  kind: 'post';
  counts: Counts | null;
  board: number[];
  code: string;
}
export type Ev = PreEv | PostEv;

/** 2 通りの仮定（柔らかい側, 鋭い側）。プリフロップの k と、ポストフロップの k。検証（見えた手札の尤度）で決める */
export const PRE_K: [number, number] = [1.0, 1.5];
export const POST_K: [number, number] = [0.5, 1.0];

const sig = (x: number): number => 1 / (1 + Math.exp(-x));
const logit = (s: number): number => {
  const c = Math.min(0.995, Math.max(0.005, s));
  return Math.log(c / (1 - c));
};

function split(counts: Counts) {
  const N = Object.values(counts).reduce((a, b) => a + b, 0);
  const pas: Counts = {};
  const ras: Counts = {};
  for (const [c, v] of Object.entries(counts)) {
    if (c === 'c' || c === 'x') pas[c] = v;
    else if (c !== 'f') ras[c] = v;
  }
  const pc = Object.values(pas).reduce((a, b) => a + b, 0) / N;
  const pr = Object.values(ras).reduce((a, b) => a + b, 0) / N;
  return { N, pas, ras, pc, pr };
}

function thetaW(zs: Float64Array, ws: Float64Array, k: number, target: number): number {
  let tot = 0;
  for (let i = 0; i < ws.length; i++) tot += ws[i];
  let lo = -40;
  let hi = 40;
  for (let it = 0; it < 45; it++) {
    const mid = (lo + hi) / 2;
    let v = 0;
    for (let i = 0; i < zs.length; i++) v += ws[i] * sig(k * (zs[i] - mid));
    v /= tot;
    if (v > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 1 つの組み合わせの（レイズ確率, 継続確率） */
function rc(z: number, k: number, pr: number, pc: number, tr: number, tc: number) {
  const R = pr <= 0 ? 0 : pr >= 1 ? 1 : sig(k * (z - tr));
  let cont = pr + pc >= 1 ? 1 : pc <= 0 ? R : sig(k * (z - tc));
  cont = Math.max(cont, R);
  return { R, cont };
}

function codeProb(code: string, R: number, cont: number, parts: ReturnType<typeof split>): number {
  const { N, pas, ras, pc, pr } = parts;
  if (code === 'f') return 1 - cont;
  if (code in pas) return ((cont - R) * pas[code]) / (pc * N);
  return (R * ras[code]) / (pr * N);
}

/** ノードの手札別確率（全組み合わせ）。戻り値は行動コード → 各組み合わせの確率 */
function nodeArrays(counts: Counts, zs: Float64Array, ws: Float64Array, k: number, codes: string[]): Record<string, Float64Array> {
  const parts = split(counts);
  const { pc, pr } = parts;
  const tr = pr <= 0 || pr >= 1 ? 0 : thetaW(zs, ws, k, pr);
  const tc = pc <= 0 || pr + pc >= 1 ? 0 : thetaW(zs, ws, k, pr + pc);
  const out: Record<string, Float64Array> = {};
  for (const c of codes) out[c] = new Float64Array(zs.length);
  for (let i = 0; i < zs.length; i++) {
    const { R, cont } = rc(zs[i], k, pr, pc, tr, tc);
    for (const c of codes) out[c][i] = codeProb(c, R, cont, parts);
  }
  return out;
}

/** プリフロップの手札クラスごとの、その行動を選ぶ確率 */
function preClassProb(counts: Counts, code: string, k: number): Record<string, number> {
  const parts = split(counts);
  const { pc, pr } = parts;
  const tr = pr <= 0 || pr >= 1 ? 0 : thetaPre(k, pr);
  const tc = pc <= 0 || pr + pc >= 1 ? 0 : thetaPre(k, pr + pc);
  const out: Record<string, number> = {};
  for (const [c, z] of Object.entries(zTable)) {
    const { R, cont } = rc(z, k, pr, pc, tr, tc);
    out[c] = codeProb(code, R, cont, parts);
  }
  return out;
}

const key = (a: number, b: number): number => a * 52 + b;

/**
 * 手札 hero（カード id の組、a<b）の、今の場面（counts, board）での各行動の確率。
 * events はその席がここまでに選んだ行動（古い順）。推定できないときは null。
 */
export function estimatePost(
  events: Ev[],
  now: { counts: Counts | null; board: number[] },
  hero: [number, number],
  kPre: number,
  kPost: number,
): Record<string, number> | null {
  if (!now.counts) return null;
  const w = new Float64Array(52 * 52);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) w[key(a, b)] = 1;

  for (const ev of events) {
    if (!ev.counts || !(ev.code in ev.counts)) continue;
    if (ev.kind === 'pre') {
      const cp = preClassProb(ev.counts, ev.code, kPre);
      for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) w[key(a, b)] *= cp[classOfIds(a, b)];
      continue;
    }
    const st = strengths(ev.board);
    const zs = Float64Array.from(st.S, logit);
    let ws = Float64Array.from(st.combos, ([a, b]) => w[key(a, b)]);
    if (ws.reduce((x, y) => x + y, 0) <= 0) ws = new Float64Array(ws.length).fill(1);
    const p = nodeArrays(ev.counts, zs, ws, kPost, [ev.code])[ev.code];
    const next = new Float64Array(52 * 52);
    let sum = 0;
    st.combos.forEach(([a, b], i) => {
      next[key(a, b)] = w[key(a, b)] * p[i];
      sum += next[key(a, b)];
    });
    if (sum > 0) w.set(next);
  }

  const st = strengths(now.board);
  const hi = st.index.get(key(hero[0], hero[1]));
  if (hi === undefined) return null;
  const zs = Float64Array.from(st.S, logit);
  let ws = Float64Array.from(st.combos, ([a, b]) => w[key(a, b)]);
  if (ws.reduce((x, y) => x + y, 0) <= 0) ws = new Float64Array(ws.length).fill(1);
  const codes = ['f', ...Object.keys(now.counts).filter((c) => c !== 'f')];
  const arr = nodeArrays(now.counts, zs, ws, kPost, codes);
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = arr[c][hi];
  return out;
}
