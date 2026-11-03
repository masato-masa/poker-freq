import { showCard } from '@/lib/board';
import { estimate } from '@/lib/hand';
import {
  STACK_FILTERS,
  actionLabel,
  liveSeats,
  lookup,
  options,
  seatNames,
  summarize,
  total,
  type PreflopIndex,
  type StackFilter,
  type State,
} from '@/lib/engine';

/** 手札別の推定の表示を、範囲(lo〜hi)で */
function rangeText(lo: number, hi: number): string {
  const f = (x: number) => Math.round(100 * x);
  if (hi < 0.005) return '0%';
  if (hi < 0.01) return '<1%';
  return f(lo) === f(hi) ? `${f(hi)}%` : `${f(lo)}〜${f(hi)}%`;
}

interface PanelProps {
  hand?: { cards: string[]; cls: string } | null;
  index: PreflopIndex;
  state: State;
  seat: number | null;
  stack: StackFilter;
  onCommit: (seat: number, code: string) => void;
  onUndo: () => void;
  onReset: () => void;
  canUndo: boolean;
}

const pct = (x: number) => (x > 0 && x < 0.001 ? '<0.1%' : `${(100 * x).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`);

function kindOf(code: string): 'fold' | 'call' | 'raise' {
  return code === 'f' ? 'fold' : code === 'c' || code === 'x' ? 'call' : 'raise';
}

export function Panel({ hand, index, state, seat, stack, onCommit, onUndo, onReset, canUndo }: PanelProps) {
  const names = seatNames(state.n);
  const buttons = (
    <div className="actions">
      <button type="button" onClick={onUndo} disabled={!canUndo}>
        ひとつ戻る
      </button>
      <button type="button" onClick={onReset} disabled={!canUndo}>
        最初から
      </button>
    </div>
  );

  if (seat === null) {
    return (
      <div className="panel">
        <h2>プリフロップ終了</h2>
        <p className="note">
          残ったのは {liveSeats(state).map((i) => names[i]).join('・')} です。フロップ以降は、まだ入っていません。
        </p>
        {buttons}
      </div>
    );
  }

  const sized = lookup(index, 'S', state, seat, stack);
  const coarse = lookup(index, 'C', state, seat, stack);
  const n = total(sized);
  const sum = summarize(coarse);
  const stackLabel = STACK_FILTERS.find((f) => f.id === stack)?.label ?? '';
  // 手札別の推定は、件数が十分ならサイズつきの頻度、足りなければサイズを問わない頻度から計算する
  const baseCounts = n >= 30 ? sized : sum.n >= 30 ? coarse : null;
  const opts = options(state, seat);
  const est = hand ? estimate(baseCounts, hand.cls, opts) : null;

  return (
    <div className="panel">
      <h2>
        {names[seat]} は何をする？ <small>（{stackLabel}）</small>
      </h2>
      <p className="note">
        {n === 0
          ? 'この流れ・サイズの場面は、データにありません。スタックを「すべて」にするか、テーブル人数を減らすと見つかることがあります。'
          : `この流れで ${n.toLocaleString()} 回の判断${n < 30 ? '（少ない。参考程度）' : ''}`}
      </p>

      {hand && (
        <p className="note est">
          手札 {hand.cards.map(showCard).join(' ')}（{hand.cls}）の<b>推定</b>
          {est ? '。右の数字が手札別、小さい数字が全員の頻度です。' : '。この場面は件数が少なく、推定できません。'}
        </p>
      )}

      <ul className="rows">
        {opts.map((code) => {
          const count = sized?.[code] ?? 0;
          const p = n > 0 ? count / n : 0;
          const e = est?.[code];
          return (
            <li key={code}>
              <button type="button" className={`row ${kindOf(code)}`} onClick={() => onCommit(seat, code)}>
                <span className="bar" style={{ width: `${(e ? e.mid : Math.max(0, p)) * 100}%` }} />
                <span className="lab">
                  {actionLabel(code, state.nraise, seat, state.n)}
                  {e && <small className="all">全員 {n > 0 ? pct(p) : '—'}</small>}
                </span>
                <span className="val">{e ? rangeText(e.lo, e.hi) : n > 0 ? pct(p) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {est && (
        <p className="note sub2">
          手札別の数字は推定です。データでは、手札が見えるのはショーダウンまで行った人だけで、強い手に偏るため、手札の強さの順位から計算しています（範囲は 2 通りの仮定の幅。フォールドの数字は特に不確かです）。
        </p>
      )}

      {sum.n > 0 && (
        <p className="note sub2">
          サイズを問わない場合（{sum.n.toLocaleString()} 回）: フォールド {pct(sum.f)} ／ コール・チェック {pct(sum.c)} ／ レイズ{' '}
          {pct(sum.r)}
        </p>
      )}
      <p className="note sub2">行を押すと、その行動を選んで次の席へ進みます。選ばれなかった間の席は、全員フォールドとみなします。</p>
      {buttons}
    </div>
  );
}
