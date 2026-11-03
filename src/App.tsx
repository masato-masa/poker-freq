import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  STACK_FILTERS,
  TABLE_SIZES,
  actionLabel,
  apply,
  candidates,
  initState,
  seatNames,
  type PreflopIndex,
  type StackFilter,
  type State,
} from '@/lib/engine';

import { Panel } from './ui/Panel';
import { Table } from './ui/Table';

/** 選んだ行動の履歴。state はその行動を選んだあとの状態。 */
interface Step {
  state: State;
  text: string;
}

export function App() {
  const [index, setIndex] = useState<PreflopIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState<number>(9);
  const [stack, setStack] = useState<StackFilter>('all');
  const [steps, setSteps] = useState<Step[]>([{ state: initState(9), text: '' }]);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/preflop.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PreflopIndex>;
      })
      .then(setIndex)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const state = steps[steps.length - 1].state;
  const cands = useMemo(() => candidates(state), [state]);
  // 選択中の席が動けなくなったら、いま動ける最初の席に移す
  const seat = picked !== null && cands.includes(picked) ? picked : (cands[0] ?? null);

  const changeSize = useCallback((size: number) => {
    setN(size);
    setSteps([{ state: initState(size), text: '' }]);
    setPicked(null);
  }, []);

  const commit = useCallback((s: number, code: string) => {
    setSteps((st) => {
      const cur = st[st.length - 1].state;
      const text = `${seatNames(cur.n)[s]} ${actionLabel(code, cur.nraise, s, cur.n)}`;
      return [...st, { state: apply(cur, s, code), text }];
    });
    setPicked(null);
  }, []);

  const undo = () => {
    setSteps((st) => (st.length > 1 ? st.slice(0, -1) : st));
    setPicked(null);
  };
  const reset = () => {
    setSteps([{ state: initState(n), text: '' }]);
    setPicked(null);
  };

  return (
    <div className="app">
      <header className="top">
        <h1>ポーカー頻度</h1>
        <p className="sub">人間のプレイ（実データ）では、この場面で何が選ばれたか</p>
      </header>

      <section className="controls" aria-label="設定">
        <div className="seg" role="group" aria-label="テーブル人数">
          {TABLE_SIZES.map((size) => (
            <button key={size} type="button" className={size === n ? 'on' : ''} onClick={() => changeSize(size)}>
              {size}人
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="有効スタック">
          {STACK_FILTERS.map((f) => (
            <button key={f.id} type="button" className={f.id === stack ? 'on' : ''} onClick={() => setStack(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <main className="main">
        <Table
          n={n}
          state={state}
          candidates={cands}
          selected={seat}
          onPick={setPicked}
          line={steps.slice(1).map((s) => s.text)}
        />
        {index ? (
          <Panel
            index={index}
            state={state}
            seat={seat}
            stack={stack}
            onCommit={commit}
            onUndo={undo}
            onReset={reset}
            canUndo={steps.length > 1}
          />
        ) : (
          <div className="panel">{error ? `データを読めませんでした: ${error}` : 'データを読み込み中…'}</div>
        )}
      </main>

      <footer className="foot">
        データ: HandHQ のオンライン・キャッシュのハンド履歴（2009 年 7 月、PokerStars 50NL）を
        <a href="https://github.com/uoftcprg/phh-dataset">トロント大学の PHH データセット</a>
        （CC BY 4.0）から集計。手札は伏せられているので、頻度は「全員の」行動です。
      </footer>
    </div>
  );
}
