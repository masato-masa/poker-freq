import { liveSeats, seatNames, shortLabel, type State } from '@/lib/engine';

interface TableProps {
  n: number;
  state: State;
  candidates: number[];
  selected: number | null;
  onPick: (seat: number) => void;
  line: string[];
}

/** 円卓。BB が手前(下)の中央、そこから時計回りに UTG … BTN, SB の順に並べる。 */
export function Table({ n, state, candidates, selected, onPick, line }: TableProps) {
  const names = seatNames(n);
  const step = 360 / n;
  const done = candidates.length === 0;
  const live = liveSeats(state);

  return (
    <div className="table-wrap">
      <div className="table" role="group" aria-label="テーブル">
        <div className="felt" aria-hidden />
        <div className="center">
          {line.length === 0 ? (
            <span className="hint">席をタップして、そのポジションの頻度を見る</span>
          ) : (
            <ol className="line">
              {line.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          )}
          {done && <span className="done">プリフロップ終了（残り {live.length} 人）</span>}
        </div>
        {names.map((name, i) => {
          const theta = ((90 + (i + 1) * step) * Math.PI) / 180;
          const x = 50 + 41 * Math.cos(theta);
          const y = 50 + 41 * Math.sin(theta);
          const act = state.acted[i];
          const isCand = candidates.includes(i);
          const cls = [
            'seat',
            isCand ? 'cand' : '',
            selected === i ? 'sel' : '',
            state.folded[i] ? 'folded' : '',
            act && act !== 'f' ? 'acted' : '',
            act && act !== 'f' && act !== 'c' && act !== 'x' ? 'raised' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={name}
              type="button"
              className={cls}
              style={{ left: `${x}%`, top: `${y}%` }}
              disabled={!isCand}
              aria-pressed={selected === i}
              aria-label={`${name}${act ? ` ${shortLabel(act)}` : ''}`}
              onClick={() => onPick(i)}
            >
              <span className="pos">{name}</span>
              <span className="st">{act ? shortLabel(act) : isCand ? '　' : '—'}</span>
              {i === n - 3 && <span className="dealer" aria-hidden>D</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
