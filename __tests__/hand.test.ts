import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { handClass, nodeProbs } from '@/lib/hand';

interface Ref {
  k_lo: number;
  k_hi: number;
  cases: { counts: Record<string, number>; hand: string; lo: Record<string, number>; hi: Record<string, number> }[];
}
const ref: Ref = JSON.parse(readFileSync('__tests__/hand-model-ref.json', 'utf8'));

describe('手札クラス', () => {
  it('2 枚から 169 クラスの名前になる', () => {
    expect(handClass('Ah', 'Th')).toBe('ATs');
    expect(handClass('Th', 'Ad')).toBe('ATo');
    expect(handClass('7c', '7d')).toBe('77');
    expect(handClass('2s', 'Kc')).toBe('K2o');
  });
});

describe('手札別の推定（Python の参照値と一致する）', () => {
  it('24 ケース × 2 通りの仮定', () => {
    for (const c of ref.cases) {
      for (const [k, want] of [
        [ref.k_lo, c.lo],
        [ref.k_hi, c.hi],
      ] as const) {
        const got = nodeProbs(c.counts, c.hand, k);
        for (const code of Object.keys(want)) expect(got[code]).toBeCloseTo(want[code], 6);
      }
    }
  });

  it('確率の合計は 1、強い手ほどレイズが多く弱い手はフォールド', () => {
    const counts = { f: 80000, c: 10000, o3: 7000, o4: 3000 };
    const sum = (h: string) => Object.values(nodeProbs(counts, h, 1.25)).reduce((a, b) => a + b, 0);
    expect(sum('ATs')).toBeCloseTo(1, 9);
    const raise = (h: string) => {
      const p = nodeProbs(counts, h, 1.25);
      return p.o3 + p.o4;
    };
    expect(raise('AA')).toBeGreaterThan(raise('ATs'));
    expect(raise('ATs')).toBeGreaterThan(raise('72o'));
    expect(nodeProbs(counts, '72o', 1.25).f).toBeGreaterThan(0.95);
  });

  it('確率が 0〜1 に収まる（見えた手札の推定のように 100% を超えない）', () => {
    const counts = { f: 49386, c: 9439, o3: 15613, o4: 7755 };
    for (const h of ['AA', 'KK', 'AKs', '22', '72o']) {
      for (const v of Object.values(nodeProbs(counts, h, 1.5))) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
