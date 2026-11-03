import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type Ev, estimatePost } from '@/lib/postHand';
import { cardId, evaluate, strengths } from '@/lib/strength';

const ids = (s: string) => s.split(' ').map(cardId);

describe('役の評価', () => {
  it('役の強さの順序', () => {
    const hands = [
      'Ah Kh Qh Jh Th 2c 3d',
      '9s 8s 7s 6s 5s Ah 2d',
      'Ks Kh Kd Kc 2h 3d 4s',
      'Ks Kh Kd 2c 2h 3d 4s',
      'Ah 9h 7h 5h 2h Kd Kc',
      '9s 8h 7d 6c 5h 2d 2s',
      'Ah 2d 3c 4s 5h Kd 9c',
      'Qs Qh Qd 8c 2h 3d 4s',
      'Js Jh 4d 4c Ah 3d 8s',
      'As Ah 9d 4c 2h 7d 8s',
      'As Kh 9d 4c 2h 7d 8s',
    ];
    const v = hands.map((h) => evaluate(ids(h)));
    expect(v).toEqual([...v].sort((a, b) => b - a));
    // Python の評価値と同じ数値
    expect(v[0]).toBe(9175040);
    expect(v[4]).toBe(6059312);
    expect(v[10]).toBe(833381);
  });

  it('キッカー・フルハウスの順序', () => {
    expect(evaluate(ids('Ah Kd 9c 8s 4h 3d 2c'))).toBeGreaterThan(evaluate(ids('Ah Qd 9c 8s 4h 3d 2c')));
    expect(evaluate(ids('Ah Ad Ac Kh Kd 3c 2s'))).toBeGreaterThan(evaluate(ids('Kh Kd Kc Ah Ad 3c 2s')));
    expect(evaluate(ids('6h 5d 4c 3s 2h Kd Kc'))).toBeLessThan(evaluate(ids('7h 6d 5c 4s 3h Kd Qc')));
  });
});

describe('ボード上の手札の強さ', () => {
  it('フロップ K♠T♦2♣ の強さは Python と同じ', () => {
    const st = strengths(ids('Ks Td 2c'));
    expect(st.combos.length).toBe(1176);
    const at = (h: string) => {
      const [a, b] = ids(h);
      return st.S[st.index.get(Math.min(a, b) * 52 + Math.max(a, b)) as number];
    };
    expect(at('Ah Kh')).toBeCloseTo(0.875, 3);
    expect(at('7h 7d')).toBeCloseTo(0.616, 3);
    expect(at('3h 4d')).toBeCloseTo(0.165, 3);
  });

  it('リバーは 1081 通りで、強い手ほど大きい', () => {
    const st = strengths(ids('Ks Td 2c 5h Ad'));
    expect(st.combos.length).toBe(1081);
    const at = (h: string) => {
      const [a, b] = ids(h);
      return st.S[st.index.get(Math.min(a, b) * 52 + Math.max(a, b)) as number];
    };
    expect(at('Ah Kh')).toBeGreaterThan(at('Kh Qd'));
    expect(at('Kh Qd')).toBeGreaterThan(at('7h 6d'));
  });
});

interface RefCase {
  name: string;
  kPre: number;
  kPost: number;
  hero: [number, number];
  events: { kind: 'pre' | 'post'; counts: Record<string, number>; board: number[] | null; code: string }[];
  now: { counts: Record<string, number>; board: number[] };
  expected: Record<string, number>;
}
const cases: RefCase[] = JSON.parse(readFileSync('__tests__/post-hand-ref.json', 'utf8'));

describe('ポストフロップの手札別推定（Python の参照値と一致する）', () => {
  it('ケースごとに小数 5 桁まで一致', () => {
    for (const c of cases) {
      const events: Ev[] = c.events.map((e) =>
        e.kind === 'pre'
          ? { kind: 'pre', counts: e.counts, code: e.code }
          : { kind: 'post', counts: e.counts, board: e.board as number[], code: e.code },
      );
      const got = estimatePost(events, c.now, c.hero, c.kPre, c.kPost);
      expect(got, c.name).not.toBeNull();
      for (const code of Object.keys(c.expected)) expect(got![code], `${c.name} ${code}`).toBeCloseTo(c.expected[code], 5);
    }
  });

  it('確率の合計は 1', () => {
    for (const c of cases) {
      const events: Ev[] = c.events.map((e) =>
        e.kind === 'pre'
          ? { kind: 'pre', counts: e.counts, code: e.code }
          : { kind: 'post', counts: e.counts, board: e.board as number[], code: e.code },
      );
      const got = estimatePost(events, c.now, c.hero, c.kPre, c.kPost)!;
      expect(Object.values(got).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });
});
