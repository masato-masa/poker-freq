/**
 * ボードの型。poker-study/engine.py の flop_tex / card_tag と必ず同じ計算にする（索引のキーに入る）。
 * カードは 'Ks' のように 2 文字（ランク + スート s h d c）。
 */

export const RANK_CHARS = 'AKQJT98765432';
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export const SUIT_MARK: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

const rank = (c: string): number => '23456789TJQKA'.indexOf(c[0]) + 2;

const maxSuit = (cards: string[]): number => Math.max(...[...new Set(cards.map((c) => c[1]))].map((s) => cards.filter((c) => c[1] === s).length));

/** フロップ 3 枚から、粗い型と細かい型を返す */
export function flopTex(cards: string[]): { coarse: string; fine: string } {
  const rk = cards.map(rank).sort((a, b) => b - a);
  const ms = maxSuit(cards);
  const paired = new Set(rk).size < rk.length;
  const suit = ms === 3 ? 'm' : ms === 2 ? 't' : 'r';
  const hi = rk[0];
  const hic = hi === 14 ? 'A' : hi === 13 ? 'K' : hi === 12 ? 'Q' : hi >= 10 ? 'JT' : hi >= 8 ? '98' : 'L';
  const conn = !paired && rk[0] - rk[2] <= 4 ? 'c' : 'd';
  const p = paired ? 'P' : 'U';
  return { coarse: `${p}${suit}${hi >= 12 ? 'H' : hi >= 9 ? 'M' : 'L'}`, fine: `${p}${suit}${hic}${conn}` };
}

/** ターン・リバーのカードが何をしたか: pair / sup(フラッシュ寄り) / over(オーバーカード) / brick */
export function cardTag(prev: string[], card: string): 'pair' | 'sup' | 'over' | 'brick' {
  const pr = prev.map(rank);
  if (pr.includes(rank(card))) return 'pair';
  if (maxSuit([...prev, card]) > maxSuit(prev) && maxSuit([...prev, card]) >= 3) return 'sup';
  if (rank(card) > Math.max(...pr)) return 'over';
  return 'brick';
}

const SUIT_JA: Record<string, string> = { m: 'モノトーン', t: 'ツートーン', r: 'レインボー' };
const TAG_JA: Record<string, string> = {
  pair: 'ペアが出た',
  sup: 'フラッシュ寄りのカード',
  over: 'オーバーカード',
  brick: 'ブランク',
};

/** 索引の「細かい型」(例 UrKd+brick) を、読める言葉にする */
export function describeTex(fine: string): string {
  const [flop, ...tags] = fine.split('+');
  const m = /^([PU])([mtr])(A|K|Q|JT|98|L)([cd])?$/.exec(flop);
  if (!m) return fine;
  const hi = m[3] === 'JT' ? 'J/T' : m[3] === '98' ? '9/8' : m[3] === 'L' ? '8以下' : m[3];
  const parts = [`${hi}ハイ`, SUIT_JA[m[2]], m[1] === 'P' ? 'ペアボード' : m[4] === 'c' ? 'つながり' : 'バラバラ'];
  return [...parts, ...tags.map((t) => TAG_JA[t] ?? t)].join('・');
}

/** 表示用: 'Ks' → 'K♠' */
export function showCard(c: string): string {
  return `${c[0]}${SUIT_MARK[c[1]]}`;
}
