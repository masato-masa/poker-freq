/**
 * ポストフロップの手順を進める状態機械と、索引の引き方。
 * キーの作り方は poker-study/post_index.py と必ず一致させる（__tests__/post.test.ts が実ハンドで照合する）。
 *
 * 席は preflop と同じ「行動順 UTG … BTN, SB, BB」の index で持つ。ポストフロップは SB から動く。
 */
import { cardTag, flopTex } from './board';
import { seatNames, liveSeats, type Counts, type StackFilter, type State } from './engine';

export type Street = 'flop' | 'turn' | 'river';
export const BET_CODES = ['b25', 'b33', 'b50', 'b66', 'b100', 'b150', 'bAI'] as const;
export const POST_RAISE_CODES = ['r2x', 'r3x', 'r4x', 'r5x+', 'rAI'] as const;

/** 行動順 index → PHH の席番号 p（SB=1, BB=2, UTG=3 …）。ポストフロップの行動順は p の昇順。 */
export const pOf = (idx: number, n: number): number => (idx === n - 2 ? 1 : idx === n - 1 ? 2 : idx + 3);
export const idxOf = (p: number, n: number): number => (p === 1 ? n - 2 : p === 2 ? n - 1 : p - 3);

export interface PostState {
  n: number;
  street: Street;
  board: string[];
  texC: string;
  texF: string;
  cls: 'LIMP' | 'SRP' | '3BP' | '4BP';
  /** プリフロップで最後にレイズした席。いなければ -1 */
  pfRaiser: number;
  flopLive: number[];
  folded: boolean[];
  prevLines: string[];
  /** この街でここまでに出た行動のトークン */
  line: string[];
  /** この街でまだ動いていない席（動く順） */
  needs: number[];
  facing: boolean;
  /** この街で各席が選んだ行動（表示用） */
  acted: (string | null)[];
}

const byP = (n: number) => (a: number, b: number) => pOf(a, n) - pOf(b, n);

/** プリフロップが終わった状態とフロップ 3 枚から、ポストフロップを始める */
export function startPost(pre: State, flop: string[]): PostState {
  const n = pre.n;
  const live = liveSeats(pre).sort(byP(n));
  const { coarse, fine } = flopTex(flop);
  return {
    n,
    street: 'flop',
    board: [...flop],
    texC: coarse,
    texF: fine,
    cls: (['LIMP', 'SRP', '3BP', '4BP'] as const)[Math.min(pre.nraise, 3)],
    pfRaiser: pre.aggressor,
    flopLive: live,
    folded: [...pre.folded],
    prevLines: [],
    line: [],
    needs: [...live],
    facing: false,
    acted: Array(n).fill(null),
  };
}

export const liveOf = (s: PostState): number[] =>
  s.folded.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0).sort(byP(s.n));

export function candidatesPost(s: PostState): number[] {
  return s.needs;
}

/** この街のベッティングが終わったか（残り 1 人のときも終わり） */
export function roundDone(s: PostState): boolean {
  return s.needs.length === 0 || liveOf(s).length <= 1;
}

export function optionsPost(s: PostState): string[] {
  return s.facing ? ['f', 'c', ...POST_RAISE_CODES] : ['x', ...BET_CODES];
}

/** applyPost の 1 手ごとの記録。範囲の追跡に使う（暗黙のチェック・フォールドも含む） */
export interface PostEvent {
  seat: number;
  code: string;
  /** この行動を選ぶ直前の状態 */
  before: PostState;
}

/** seat が code を選ぶ。先に動くはずだった席は、ベットがあればフォールド、なければチェックとみなす。 */
export function applyPostSteps(s: PostState, seat: number, code: string): { next: PostState; events: PostEvent[] } {
  const at = s.needs.indexOf(seat);
  if (at < 0) throw new Error(`seat ${seat} cannot act`);
  const implicit = s.facing ? 'f' : 'x';
  const events: PostEvent[] = [];
  let cur = s;
  for (const q of s.needs.slice(0, at)) {
    events.push({ seat: q, code: implicit, before: cur });
    cur = step(cur, q, implicit);
  }
  events.push({ seat, code, before: cur });
  return { next: step(cur, seat, code), events };
}

export function applyPost(s: PostState, seat: number, code: string): PostState {
  return applyPostSteps(s, seat, code).next;
}

/** needs の先頭の席が 1 手指す */
function step(s: PostState, seat: number, code: string): PostState {
  if (s.needs[0] !== seat) throw new Error(`seat ${seat} is not next`);
  const next: PostState = { ...s, folded: [...s.folded], line: [...s.line, code], acted: [...s.acted] };
  next.acted[seat] = code;
  if (code === 'f') next.folded[seat] = true;
  if (code === 'f' || code === 'c' || code === 'x') {
    next.needs = s.needs.slice(1);
    return next;
  }
  // ベット／レイズ: 他の生きている席が、この席の次から順に、もう一度動く
  const ring = liveOf(next);
  const start = ring.indexOf(seat);
  next.needs = [...ring.slice(start + 1), ...ring.slice(0, start)];
  next.facing = true;
  return next;
}

/** ターン・リバーのカードを出して、次の街へ進む */
export function nextStreet(s: PostState, card: string): PostState {
  if (s.street === 'river') throw new Error('river is the last street');
  const tag = cardTag(s.board, card);
  const live = liveOf(s);
  return {
    ...s,
    street: s.street === 'flop' ? 'turn' : 'river',
    board: [...s.board, card],
    texC: `${s.texC}+${tag}`,
    texF: `${s.texF}+${tag}`,
    prevLines: [...s.prevLines, s.line.join('.')],
    line: [],
    needs: live,
    facing: false,
    acted: Array(s.n).fill(null),
  };
}

/** 行の見出し用の名前 */
export function labelPost(code: string): string {
  switch (code) {
    case 'f':
      return 'フォールド';
    case 'x':
      return 'チェック';
    case 'c':
      return 'コール';
    case 'bAI':
      return 'ベット オールイン';
    case 'rAI':
      return 'レイズ オールイン';
  }
  if (code.startsWith('b')) return `ベット ポットの${code.slice(1)}%`;
  return `レイズ ${code.slice(1).replace('x', '倍')}`;
}

// ---- 索引 ----

export interface PostKeys {
  fine: string;
  mid: string;
  coarse: string;
}

export function postKeys(s: PostState, seat: number, stack: StackFilter): PostKeys {
  const names = seatNames(s.n);
  const live = liveOf(s);
  const lp = live.map((i) => pOf(i, s.n));
  const me = pOf(seat, s.n);
  const role = me === Math.max(...lp) ? 'IP' : me === Math.min(...lp) ? 'OOP' : 'MID';
  const agg = seat === s.pfRaiser ? 'A' : 'C';
  const pair =
    s.pfRaiser < 0
      ? 'limp'
      : `${names[s.pfRaiser]}v${s.flopLive.filter((q) => q !== s.pfRaiser).map((q) => names[q]).join('+')}`;
  const sl = s.line.join('.');
  const pv = s.prevLines.join('/');
  const base1 = `${s.street}|${s.cls}|np${live.length}|${role}|${agg}|${pv}>${sl}|${s.texC}`;
  const base0 = `${s.street}|${s.cls}|np${live.length}|${role}|${agg}|${sl}`;
  return {
    fine: `P2|${s.street}|${s.cls}|${pair}|${names[seat]}|${pv}>${sl}|${s.texF}`,
    mid: `P1|${base1}|${stack}`,
    coarse: `P0|${base0}|${stack}`,
  };
}

export interface PostIndex {
  v: number;
  meta: { hands: number; sources: string[] };
  tab: Record<string, Counts>;
}

export const lookupPost = (idx: PostIndex, key: string): Counts | null => idx.tab[key] ?? null;
