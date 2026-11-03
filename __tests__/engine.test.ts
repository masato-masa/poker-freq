import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  actionLabel,
  apply,
  candidates,
  initState,
  keyFor,
  liveSeats,
  lookup,
  options,
  STAKES,
  summarize,
  total,
  type PreflopIndex,
} from '@/lib/engine';

const load = (file: string): PreflopIndex => JSON.parse(readFileSync(`public/data/${file}`, 'utf8'));
const idx = load('preflop-all.json');

describe('状態機械', () => {
  it('最初は全員が動ける(UTG から BB まで)', () => {
    expect(candidates(initState(9))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('オープンの後は、オープナー以外の席が動ける', () => {
    const s = apply(initState(9), 0, 'o3');
    expect(candidates(s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.sized).toEqual(['UTG:o3']);
    expect(s.coarse).toEqual(['UTG:R1']);
  });

  it('飛ばした席は全員フォールドになる', () => {
    const s = apply(apply(initState(9), 0, 'o3'), 4, 'c');
    expect(s.folded.slice(1, 4)).toEqual([true, true, true]);
    expect(s.acted[0]).toBe('o3');
    expect(s.sized).toEqual(['UTG:o3', 'HJ:c']);
  });

  it('3bet の後は、残っている席が順に動く（オープナーとコーラーに戻る）', () => {
    let s = apply(initState(9), 0, 'o3');
    s = apply(s, 4, 'c');
    s = apply(s, 6, 'r3x');
    expect(candidates(s)).toEqual([7, 8, 0, 4]);
    expect(s.sized).toEqual(['UTG:o3', 'HJ:c', 'BTN:r3x']);
    expect(s.coarse).toEqual(['UTG:R1', 'HJ:c', 'BTN:R2']);
    expect(s.nraise).toBe(2);
  });

  it('全員がレイズに下りたらベッティング終了', () => {
    let s = apply(initState(6), 3, 'o3'); // BTN オープン
    s = apply(s, 4, 'f');
    s = apply(s, 5, 'f');
    expect(candidates(s)).toEqual([]);
    expect(liveSeats(s)).toEqual([3]);
  });

  it('BB のオプション: 全員リンプなら BB がチェックして終わる', () => {
    let s = apply(initState(6), 0, 'c');
    expect(candidates(s)).toEqual([1, 2, 3, 4, 5]);
    s = apply(s, 5, 'x');
    expect(candidates(s)).toEqual([]);
    expect(options(initState(6), 5)).toContain('x');
    expect(options(initState(6), 5)).not.toContain('f');
  });

  it('オープンされたあとの BB はフォールド・コール・レイズを選べる', () => {
    const s = apply(initState(6), 0, 'o3');
    expect(options(s, 5).slice(0, 2)).toEqual(['f', 'c']);
    expect(options(s, 5)).toContain('r3x');
    expect(options(s, 5)).not.toContain('o3');
  });

  it('動けない席は選べない', () => {
    const s = apply(initState(9), 0, 'o3');
    expect(() => apply(s, 0, 'f')).toThrow();
  });

  it('表示名', () => {
    expect(actionLabel('o2.5', 0, 0, 9)).toBe('オープン 2.5bb');
    expect(actionLabel('r3x', 1, 6, 9)).toBe('3bet 3倍');
    expect(actionLabel('r5x+', 2, 6, 9)).toBe('4bet 5倍+');
    expect(actionLabel('c', 0, 7, 9)).toBe('コンプリート');
    expect(actionLabel('c', 0, 3, 9)).toBe('リンプ');
  });
});

describe('索引の引き方', () => {
  it('最初の席は 9 人テーブルで 100 万回以上の判断がある', () => {
    const c = lookup(idx, 'S', initState(9), 0, 'all');
    expect(total(c)).toBeGreaterThan(1_000_000);
  });

  it('ステーク別の索引は、合わせるとすべてと同じ回数になる', () => {
    const sum = STAKES.filter((s) => s.id !== 'all')
      .map((s) => total(lookup(load(s.file), 'S', initState(9), 0, 'all')))
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(total(lookup(idx, 'S', initState(9), 0, 'all')));
  });

  it('UTG のフォールド率は 6 割〜9 割、レイズは 1 割前後', () => {
    const r = summarize(lookup(idx, 'C', initState(9), 0, 'all'));
    expect(r.f).toBeGreaterThan(0.6);
    expect(r.f).toBeLessThan(0.9);
    expect(r.r).toBeGreaterThan(0.03);
    expect(r.r).toBeLessThan(0.2);
  });

  it('UTG が 3bb オープンしたあとの HJ の頻度が引ける', () => {
    const s = apply(initState(9), 0, 'o3');
    const c = lookup(idx, 'S', s, 4, 'all');
    expect(total(c)).toBeGreaterThan(100);
    const r = summarize(c);
    expect(r.f + r.c + r.r).toBeCloseTo(1, 6);
    expect(r.f).toBeGreaterThan(0.6);
  });

  it('キーの形', () => {
    const s = apply(apply(initState(9), 0, 'o3'), 4, 'c');
    expect(keyFor('S', s, 6, 's70-130')).toBe('S|9|BTN|UTG:o3>HJ:c|s70-130');
    expect(keyFor('C', s, 6, 'all')).toBe('C|9|BTN|UTG:R1>HJ:c|all');
  });
});
