import { useState } from 'react';

import { describeTex } from '@/lib/board';
import { STACK_FILTERS, seatNames, summarize, total, type Counts, type StackFilter } from '@/lib/engine';
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
  hasHand: boolean;
  post: PostState;
  seat: number;
  stack: StackFilter;
  onCommit: (seat: number, code: string) => void;
  onUndo: () => void;
  onReset: () => void;
}

const pct = (x: number) => (x > 0 && x < 0.001 ? '<0.1%' : `${(100 * x).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`);
const kindOf = (code: string): 'fold' | 'call' | 'raise' =>
  code === 'f' ? 'fold' : code === 'c' || code === 'x' ? 'call' : 'raise';

type Level = 'fine' | 'mid' | 'coarse';
const LEVELS: { id: Level; label: string; help: string }[] = [
  { id: 'fine', label: '盤面ぴったり', help: '同じ型のボード・同じ流れ・同じ相手の組み合わせ' },
  { id: 'mid', label: '盤面の型', help: '大まかなボードの型・同じ流れ・人数と位置関係' },
  { id: 'coarse', label: '盤面を問わない', help: 'ボードは問わず、この街の流れと位置関係だけ' },
];

export function PostPanel({ index, loading, hasHand, post, seat, stack, onCommit, onUndo, onReset }: PostPanelProps) {
  const [chosen, setChosen] = useState<Level | null>(null);
  const names = seatNames(post.n);
  const buttons = (
    <div className="actions">
      <button type="button" onClick={onUndo}>
        ひとつ戻る
      </button>
      <button type="button" onClick={onReset}>
        最初から
      </button>
    </div>
  );

  if (!index) {
    return (
      <div className="panel">
        <p className="note">{loading ? 'フロップ以降のデータを読み込み中…' : 'データを読めませんでした。'}</p>
        {buttons}
      </div>
    );
  }

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

  return (
    <div className="panel">
      <h2>
        {names[seat]} は何をする？ <small>（{streetJa}）</small>
      </h2>
      <p className="note">
        ボード: {describeTex(post.texF)} ／ {post.cls === 'LIMP' ? 'リンプポット' : post.cls === 'SRP' ? 'シングルレイズ' : post.cls === '3BP' ? '3bet ポット' : '4bet 以上のポット'}
        {' ／ '}残り {post.folded.filter((f) => !f).length} 人
      </p>

      {hasHand && (
        <p className="note est">手札別の推定はプリフロップだけです。フロップ以降は、全員の頻度を出しています。</p>
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
          return (
            <li key={code}>
              <button type="button" className={`row ${kindOf(code)}`} onClick={() => onCommit(seat, code)}>
                <span className="bar" style={{ width: `${p * 100}%` }} />
                <span className="lab">{labelPost(code)}</span>
                <span className="val">{n > 0 ? pct(p) : '—'}</span>
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
      {buttons}
    </div>
  );
}
