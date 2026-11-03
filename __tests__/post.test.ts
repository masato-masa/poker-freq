import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { cardTag, flopTex } from '@/lib/board';
import { apply, candidates, initState } from '@/lib/engine';
import {
  applyPost,
  candidatesPost,
  idxOf,
  liveOf,
  nextStreet,
  optionsPost,
  postKeys,
  roundDone,
  startPost,
  type PostState,
} from '@/lib/postflop';

interface Fixture {
  n: number;
  pre: [number, string][];
  events: ([string, string] | [number, string])[];
  expected: { p: number; keys: string[]; out: string }[];
}
const fixtures: Fixture[] = JSON.parse(readFileSync('__tests__/post-fixtures.json', 'utf8'));

describe('ボードの型', () => {
  it('フロップ', () => {
    expect(flopTex(['Ks', 'Td', '2c'])).toEqual({ coarse: 'UrH', fine: 'UrKd' });
    expect(flopTex(['9h', '8h', '7d'])).toEqual({ coarse: 'UtM', fine: 'Ut98c' });
    expect(flopTex(['Qs', 'Qd', '4s'])).toEqual({ coarse: 'PtH', fine: 'PtQd' });
  });
  it('ターン・リバーのカード', () => {
    expect(cardTag(['Ks', 'Td', '2c'], 'Kh')).toBe('pair');
    expect(cardTag(['Ks', 'Td', '2s'], '7s')).toBe('sup');
    expect(cardTag(['Ks', 'Td', '2c'], 'Ah')).toBe('over');
    expect(cardTag(['Ks', 'Td', '2c'], '5h')).toBe('brick');
  });
});

describe('ポストフロップの状態機械', () => {
  const start = (n: number, ...pre: [number, string][]): PostState => {
    let s = initState(n);
    for (const [seat, code] of pre) s = apply(s, seat, code);
    return startPost(s, ['Ks', 'Td', '2c']);
  };

  it('BTN オープン・BB コールのヘッズアップは BB から動く', () => {
    const s = start(6, [3, 'o3'], [4, 'f'], [5, 'c'] /* 6max: seats UTG,HJ,CO,BTN,SB,BB */);
    expect(s.cls).toBe('SRP');
    expect(candidatesPost(s)).toEqual([5, 3]);
  });

  it('チェック・ベット・コールで街が終わる', () => {
    let s = start(6, [3, 'o3'], [4, 'f'], [5, 'c']);
    s = applyPost(s, 5, 'x');
    expect(roundDone(s)).toBe(false);
    s = applyPost(s, 3, 'b33');
    expect(candidatesPost(s)).toEqual([5]);
    expect(optionsPost(s)[0]).toBe('f');
    s = applyPost(s, 5, 'c');
    expect(roundDone(s)).toBe(true);
    expect(s.line).toEqual(['x', 'b33', 'c']);
    const t = nextStreet(s, '5h');
    expect(t.street).toBe('turn');
    expect(t.prevLines).toEqual(['x.b33.c']);
    expect(t.texC).toBe('UrH+brick');
  });

  it('先に動くはずだった席は、ベットなしならチェック、ベットありならフォールド', () => {
    let s = start(6, [3, 'o3'], [4, 'f'], [5, 'c']);
    s = applyPost(s, 3, 'b50'); // BB を飛ばす → BB はチェック扱い
    expect(s.line).toEqual(['x', 'b50']);
    expect(candidatesPost(s)).toEqual([5]); // BB がもう一度動く
    let m = start(9, [0, 'o3'], [8, 'c']);
    m = applyPost(m, 0, 'b50');
    expect(m.line).toEqual(['x', 'b50']);
  });

  it('全員がベットに下りたら終わり', () => {
    let s = start(6, [3, 'o3'], [4, 'f'], [5, 'c']);
    s = applyPost(s, 5, 'b50');
    s = applyPost(s, 3, 'f');
    expect(liveOf(s)).toEqual([5]);
    expect(roundDone(s)).toBe(true);
  });
});

describe('実ハンドとの照合（Python の索引と同じキーになる）', () => {
  it('キーが一致する', () => {
    let hands = 0;
    let skipped = 0;
    let decisions = 0;
    const bad: string[] = [];
    for (const fx of fixtures) {
      try {
        let pre = initState(fx.n);
        for (const [p, code] of fx.pre) {
          const seat = idxOf(p, fx.n);
          if (candidates(pre)[0] !== seat) throw new Error('preflop order');
          pre = apply(pre, seat, code);
        }
        let post: PostState | null = null;
        let k = 0;
        for (const [a, b] of fx.events) {
          if (a === 'deal') {
            const cards = (b as string).match(/../g) as string[];
            if (!post) post = startPost(pre, cards);
            else {
              if (!roundDone(post)) throw new Error('round not done');
              post = nextStreet(post, cards[0]);
            }
            continue;
          }
          const seat = idxOf(a as number, fx.n);
          if (!post || candidatesPost(post)[0] !== seat) throw new Error('postflop order');
          const exp = fx.expected[k++];
          const keys = postKeys(post, seat, 'all');
          const got = [keys.fine, keys.mid, keys.coarse];
          const want = [exp.keys[0], exp.keys[1], exp.keys[3]];
          decisions++;
          if (JSON.stringify(got) !== JSON.stringify(want) && bad.length < 5) bad.push(`${JSON.stringify(got)} != ${JSON.stringify(want)}`);
          post = applyPost(post, seat, b as string);
        }
        hands++;
      } catch {
        skipped++;
      }
    }
    expect(bad).toEqual([]);
    expect(hands).toBeGreaterThan(fixtures.length * 0.9);
    expect(decisions).toBeGreaterThan(500);
    console.log(`照合: ${hands} ハンド / ${decisions} 判断を照合、再生できず ${skipped}`);
  });
});
