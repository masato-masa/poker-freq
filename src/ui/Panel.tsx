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

interface PanelProps {
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

export function Panel({ index, state, seat, stack, onCommit, onUndo, onReset, canUndo }: PanelProps) {
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

      <ul className="rows">
        {options(state, seat).map((code) => {
          const count = sized?.[code] ?? 0;
          const p = n > 0 ? count / n : 0;
          return (
            <li key={code}>
              <button type="button" className={`row ${kindOf(code)}`} onClick={() => onCommit(seat, code)}>
                <span className="bar" style={{ width: `${Math.max(0, p) * 100}%` }} />
                <span className="lab">{actionLabel(code, state.nraise, seat, state.n)}</span>
                <span className="val">{n > 0 ? pct(p) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>

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
