import { useMemo, useState } from 'react';

import { describeTex, showCard } from '@/lib/board';
import { STACK_FILTERS, seatNames, summarize, total, type Counts, type StackFilter } from '@/lib/engine';
import { POST_K, PRE_K, estimatePost, type Ev } from '@/lib/postHand';
import { cardId } from '@/lib/strength';
import { pct, rangeText } from './format';
import {
  labelPost,
  lookupPost,
  optionsPost,
  postKeys,
  type PostIndex,
  type PostState,
} from '@/lib/postflop';

interface PostPanelProps {
  index: PostIndex | null;
  loading: boolean;
  hero: [number, number] | null;
  trail: Ev[];
  post: PostState;
  seat: number;
  stack: StackFilter;
  onCommit: (seat: number, code: string) => void;
  onUndo: () => void;
  onReset: () => void;
}

const idToCard = (id: number): string => `${'23456789TJQKA'[id >> 2]}${'shdc'[id & 3]}`;
const kindOf = (code: string): 'fold' | 'call' | 'raise' =>
  code === 'f' ? 'fold' : code === 'c' || code === 'x' ? 'call' : 'raise';

type Level = 'fine' | 'mid' | 'coarse';
const LEVELS: { id: Level; label: string; help: string }[] = [
  { id: 'fine', label: '盤面ぴったり', help: '同じ型のボード・同じ流れ・同じ相手の組み合わせ' },
  { id: 'mid', label: '盤面の型', help: '大まかなボードの型・同じ流れ・人数と位置関係' },
  { id: 'coarse', label: '盤面を問わない', help: 'ボードは問わず、この街の流れと位置関係だけ' },
];

const Buttons = ({ onUndo, onReset }: { onUndo: () => void; onReset: () => void }) => (
  <div className="actions">
    <button type="button" onClick={onUndo}>
      ひとつ戻る
    </button>
    <button type="button" onClick={onReset}>
      最初から
    </button>
  </div>
);

export function PostPanel(props: PostPanelProps) {
  const { index, loading, onUndo, onReset } = props;
  if (!index) {
    return (
      <div className="panel">
        <p className="note">{loading ? 'フロップ以降のデータを読み込み中…' : 'データを読めませんでした。'}</p>
        <Buttons onUndo={onUndo} onReset={onReset} />
      </div>
    );
  }
  return <PostPanelBody {...props} index={index} />;
}

function PostPanelBody({
  index,
  hero,
  trail,
  post,
  seat,
  stack,
  onCommit,
  onUndo,
  onReset,
}: PostPanelProps & { index: PostIndex }) {
  const [chosen, setChosen] = useState<Level | null>(null);
  const names = seatNames(post.n);

  const keys = postKeys(post, seat, stack);
  const counts: Record<Level, Counts | null> = {
    fine: lookupPost(index, keys.fine),
    mid: lookupPost(index, keys.mid),
    coarse: lookupPost(index, keys.coarse),
  };
  const ns: Record<Level, number> = { fine: total(counts.fine), mid: total(counts.mid), coarse: total(counts.coarse) };
  // 既定は「十分な件数のある、いちばん細かい条件」
  const auto: Level = ns.fine >= 30 ? 'fine' : ns.mid >= 30 ? 'mid' : ns.coarse > 0 ? 'coarse' : 'fine';
  const level = chosen ?? auto;
  const c = counts[level];
  const n = ns[level];
  const stackLabel = STACK_FILTERS.find((f) => f.id === stack)?.label ?? '';
  const streetJa = { flop: 'フロップ', turn: 'ターン', river: 'リバー' }[post.street];
  const sum = summarize(c);

  // 手札別の推定: その席のここまでの行動で範囲を絞り、2 通りの仮定の幅を出す
  const est = useMemo(() => {
    if (!hero || !c || n === 0) return null;
    const now = { counts: c, board: post.board.map(cardId) };
    const lo = estimatePost(trail, now, hero, PRE_K[0], POST_K[0]);
    const hi = estimatePost(trail, now, hero, PRE_K[1], POST_K[1]);
    if (!lo || !hi) return null;
    const out: Record<string, { lo: number; hi: number; mid: number }> = {};
    for (const code of Object.keys(lo)) {
      const x = lo[code];
      const y = hi[code] ?? 0;
      out[code] = { lo: Math.min(x, y), hi: Math.max(x, y), mid: (x + y) / 2 };
    }
    return out;
  }, [hero, c, n, trail, post.board]);

  return (
    <div className="panel">
      <h2>
        {names[seat]} は何をする？ <small>（{streetJa}）</small>
      </h2>
      <p className="note">
        ボード: {describeTex(post.texF)} ／ {post.cls === 'LIMP' ? 'リンプポット' : post.cls === 'SRP' ? 'シングルレイズ' : post.cls === '3BP' ? '3bet ポット' : '4bet 以上のポット'}
        {' ／ '}残り {post.folded.filter((f) => !f).length} 人
      </p>

      {hero && (
        <p className="note est">
          手札 {hero.map((id) => showCard(idToCard(id))).join(' ')} の<b>推定</b>
          {est ? '。右の数字が手札別、小さい数字が全員の頻度です。' : '。この条件は件数が少なく、推定できません。'}
        </p>
      )}

      <div className="seg lv" role="group" aria-label="条件の細かさ">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={l.id === level ? 'on' : ''}
            onClick={() => setChosen(l.id)}
            title={l.help}
          >
            {l.label}
            <small>{ns[l.id] > 0 ? ns[l.id].toLocaleString() : '—'}</small>
          </button>
        ))}
      </div>
      <p className="note">
        {n === 0
          ? 'この条件の場面は、データにありません。右の「盤面の型」「盤面を問わない」を試してください。'
          : `${LEVELS.find((l) => l.id === level)!.help}（${n.toLocaleString()} 回${n < 30 ? '。少ない、参考程度' : ''}）`}
        {level !== 'fine' && stack !== 'all' && `　有効スタック ${stackLabel} で絞り込み中`}
      </p>

      <ul className="rows">
        {optionsPost(post).map((code) => {
          const count = c?.[code] ?? 0;
          const p = n > 0 ? count / n : 0;
          const e = est?.[code];
          return (
            <li key={code}>
              <button type="button" className={`row ${kindOf(code)}`} onClick={() => onCommit(seat, code)}>
                <span className="bar" style={{ width: `${(e ? e.mid : p) * 100}%` }} />
                <span className="lab">
                  {labelPost(code)}
                  {e && <small className="all">全員 {n > 0 ? pct(p) : '—'}</small>}
                </span>
                <span className="val">{e ? rangeText(e.lo, e.hi) : n > 0 ? pct(p) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {sum.n > 0 && (
        <p className="note sub2">
          まとめ: フォールド {pct(sum.f)} ／ チェック・コール {pct(sum.c)} ／ ベット・レイズ {pct(sum.r)}
        </p>
      )}
      <p className="note sub2">
        行を押すと確定して次へ進みます。先に動くはずだった席は、ベットがなければチェック、あればフォールドとみなします。
        ステークの絞り込みは「盤面の型」「盤面を問わない」にだけ効きます。
      </p>
      {est && (
        <p className="note sub2">
          手札別の数字は推定です。見えているデータでは、手札はショーダウンまで行った人のぶんだけなので、手札の強さ（ボード上でランダムな手に勝つ確率）と、その席のここまでの行動から計算しています。ブラフ（弱い手のベット）やスロープレイ（強い手のチェック）は捉えません。
        </p>
      )}
      <Buttons onUndo={onUndo} onReset={onReset} />
    </div>
  );
}
