/**
 * プリフロップの手順を進める状態機械と、索引(public/data/preflop.json)の引き方。
 * キーの作り方は poker-study/pre_index.py と必ず一致させる。
 *
 * 席は行動順 UTG … BTN, SB, BB の並びで持つ（index 0 が最初に動く席、最後が BB）。
 */

export const LABELS: Record<number, string[]> = {
  9: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN'],
  6: ['UTG', 'HJ', 'CO', 'BTN'],
};

export const TABLE_SIZES = [9, 8, 7, 6] as const;

export function seatNames(n: number): string[] {
  return [...LABELS[n], 'SB', 'BB'];
}

export type StackFilter = 'all' | 's<35' | 's35-70' | 's70-130' | 's130+';
export const STACK_FILTERS: { id: StackFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 's<35', label: '〜35bb' },
  { id: 's35-70', label: '35〜70' },
  { id: 's70-130', label: '70〜130' },
  { id: 's130+', label: '130bb〜' },
];

/** 行動コード: f=フォールド c=コール(リンプ) x=チェック o*=オープン(bb) r*=レイズ(直前のベットの倍率) *AI=オールイン */
export const OPEN_CODES = ['o2', 'o2.5', 'o3', 'o4', 'o5+', 'oAI'] as const;
export const RAISE_CODES = ['r2x', 'r3x', 'r4x', 'r5x+', 'rAI'] as const;

export interface State {
  n: number;
  folded: boolean[];
  /** 最後に動いた席の次。ここから前向きに、まだ動いていない席を探す */
  cursor: number;
  /** レイズが入っていれば最後にレイズした席。入っていなければ -1（BB のオプションで閉じる） */
  aggressor: number;
  nraise: number;
  bbActed: boolean;
  /** 席ごとの確定した行動（暗黙のフォールドも 'f'） */
  acted: (string | null)[];
  /** 索引のキーに使う、フォールドを除いた行（サイズつき／なし） */
  sized: string[];
  coarse: string[];
}

export function initState(n: number): State {
  return {
    n,
    folded: Array(n).fill(false),
    cursor: 0,
    aggressor: -1,
    nraise: 0,
    bbActed: false,
    acted: Array(n).fill(null),
    sized: [],
    coarse: [],
  };
}

/** いま動ける席（行動順）。空ならプリフロップのベッティング終了。 */
export function candidates(s: State): number[] {
  const out: number[] = [];
  const bb = s.n - 1;
  for (let k = 0; k < s.n; k++) {
    const i = (s.cursor + k) % s.n;
    if (s.aggressor >= 0) {
      if (i === s.aggressor) break;
    } else if (s.bbActed) {
      break;
    }
    if (!s.folded[i]) out.push(i);
    if (s.aggressor < 0 && i === bb) break;
  }
  return out;
}

/** その席が「払うべきベットがある」か。BB は誰もレイズしていなければチェックできる。 */
export function isFacing(s: State, seat: number): boolean {
  return !(seat === s.n - 1 && s.nraise === 0);
}

/** その席が選べる行動を、表示したい順に返す。 */
export function options(s: State, seat: number): string[] {
  const base = isFacing(s, seat) ? ['f', 'c'] : ['x'];
  return [...base, ...(s.nraise === 0 ? OPEN_CODES : RAISE_CODES)];
}

/** seat が code を選ぶ。途中の席（cursor から seat の手前まで）は全員フォールドとみなす。 */
export function apply(s: State, seat: number, code: string): State {
  const cand = candidates(s);
  if (!cand.includes(seat)) throw new Error(`seat ${seat} cannot act`);
  const names = seatNames(s.n);
  const next: State = {
    ...s,
    folded: [...s.folded],
    acted: [...s.acted],
    sized: [...s.sized],
    coarse: [...s.coarse],
  };
  for (const i of cand) {
    if (i === seat) break;
    next.folded[i] = true;
    next.acted[i] = 'f';
  }
  next.acted[seat] = code;
  next.cursor = (seat + 1) % s.n;
  if (code === 'f') {
    next.folded[seat] = true;
    return next;
  }
  if (code === 'c' || code === 'x') {
    next.sized.push(`${names[seat]}:${code}`);
    next.coarse.push(`${names[seat]}:${code}`);
    if (seat === s.n - 1 && s.nraise === 0) next.bbActed = true;
    return next;
  }
  next.nraise = s.nraise + 1;
  next.aggressor = seat;
  next.sized.push(`${names[seat]}:${code}`);
  next.coarse.push(`${names[seat]}:R${Math.min(next.nraise, 4)}`);
  return next;
}

export function liveSeats(s: State): number[] {
  return s.folded.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
}

// ---- 索引 ----

export type Counts = Record<string, number>;
export interface PreflopIndex {
  v: number;
  meta: { hands: number; sources: string[]; labels: Record<string, string[]>; license: string };
  tab: Record<string, Counts>;
}

export function keyFor(kind: 'S' | 'C', s: State, seat: number, stack: StackFilter): string {
  const line = (kind === 'S' ? s.sized : s.coarse).join('>');
  return `${kind}|${s.n}|${seatNames(s.n)[seat]}|${line}|${stack}`;
}

export function lookup(idx: PreflopIndex, kind: 'S' | 'C', s: State, seat: number, stack: StackFilter): Counts | null {
  return idx.tab[keyFor(kind, s, seat, stack)] ?? null;
}

export function total(c: Counts | null): number {
  return c ? Object.values(c).reduce((a, b) => a + b, 0) : 0;
}

/** サイズを無視した、フォールド／コール(チェック)／レイズ の割合 */
export function summarize(c: Counts | null): { f: number; c: number; r: number; n: number } {
  const n = total(c);
  if (!c || n === 0) return { f: 0, c: 0, r: 0, n: 0 };
  let f = 0;
  let call = 0;
  let r = 0;
  for (const [k, v] of Object.entries(c)) {
    if (k === 'f') f += v;
    else if (k === 'c' || k === 'x') call += v;
    else r += v;
  }
  return { f: f / n, c: call / n, r: r / n, n };
}

// ---- 表示用の名前 ----

const BET_NAMES = ['オープン', '3bet', '4bet', '5bet', '6bet'];

export function raiseName(nraise: number): string {
  return BET_NAMES[Math.min(nraise, BET_NAMES.length - 1)];
}

export function actionLabel(code: string, nraiseBefore: number, seat: number, n: number): string {
  switch (code) {
    case 'f':
      return 'フォールド';
    case 'x':
      return 'チェック';
    case 'c':
      return nraiseBefore === 0 && seat !== n - 1 ? (seat === n - 2 ? 'コンプリート' : 'リンプ') : 'コール';
    case 'oAI':
    case 'rAI':
      return `${raiseName(nraiseBefore)} オールイン`;
  }
  if (code.startsWith('o')) return `${raiseName(nraiseBefore)} ${code.slice(1)}bb`;
  return `${raiseName(nraiseBefore)} ${code.slice(1)}`.replace('x', '倍');
}

/** 盤上のチップなどに出す短い表記 */
export function shortLabel(code: string): string {
  switch (code) {
    case 'f':
      return 'FOLD';
    case 'x':
      return 'CHECK';
    case 'c':
      return 'CALL';
    case 'oAI':
    case 'rAI':
      return 'ALL-IN';
  }
  if (code.startsWith('o')) return `${code.slice(1)}bb`;
  return code.slice(1).replace('x', '×');
}
