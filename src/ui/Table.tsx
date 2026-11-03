import { seatNames, shortLabel } from '@/lib/engine';
import { showCard } from '@/lib/board';

export interface TableView {
  n: number;
  folded: boolean[];
  /** いま見せる、各席の行動（プリフロップは確定した行動、ポストフロップはこの街の行動） */
  acted: (string | null)[];
  candidates: number[];
  selected: number | null;
  board: string[];
  /** 中央に出す一言（空なら案内文） */
  status: string;
}

interface TableProps {
  view: TableView;
  onPick: (seat: number) => void;
}

const isRed = (c: string) => c[1] === 'h' || c[1] === 'd';

/** 円卓。BB が手前(下)の中央、そこから時計回りに UTG … BTN, SB の順に並べる。 */
export function Table({ view, onPick }: TableProps) {
  const { n, folded, acted, candidates, selected, board, status } = view;
  const names = seatNames(n);
  const step = 360 / n;

  return (
    <div className="table-wrap">
      <div className="table" role="group" aria-label="テーブル">
        <div className="felt" aria-hidden />
        <div className="center">
          {board.length > 0 && (
            <div className="board" aria-label="ボード">
              {board.map((c) => (
                <span key={c} className={`card${isRed(c) ? ' red' : ''}`}>
                  {showCard(c)}
                </span>
              ))}
            </div>
          )}
          <span className={status ? 'done' : 'hint'}>
            {status || (board.length > 0 ? '席をタップして頻度を見る' : '席をタップして、そのポジションの頻度を見る')}
          </span>
        </div>
        {names.map((name, i) => {
          const theta = ((90 + (i + 1) * step) * Math.PI) / 180;
          const x = 50 + 41 * Math.cos(theta);
          const y = 50 + 41 * Math.sin(theta);
          const act = acted[i];
          const isCand = candidates.includes(i);
          const cls = [
            'seat',
            isCand ? 'cand' : '',
            selected === i ? 'sel' : '',
            folded[i] ? 'folded' : '',
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
              <span className="st">{act ? shortLabel(act) : folded[i] ? 'FOLD' : isCand ? '　' : '—'}</span>
              {i === n - 3 && <span className="dealer" aria-hidden>D</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
