import { useEffect, useState } from 'react';

import { RANK_CHARS, SUITS, SUIT_MARK, showCard } from '@/lib/board';

interface CardPickerProps {
  title: string;
  /** 選ぶ枚数（フロップ 3、ターン・リバー 1） */
  need: number;
  /** すでに出ているカード（選べない） */
  used: string[];
  onDone: (cards: string[]) => void;
}

/** カードを選ぶ。枚数がそろったら自動で確定する。 */
export function CardPicker({ title, need, used, onDone }: CardPickerProps) {
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (c: string) => setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  // 枚数がそろったら確定する
  useEffect(() => {
    if (picked.length === need) {
      onDone(picked);
      setPicked([]);
    }
  }, [picked, need, onDone]);

  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="note">
        {need === 3 ? '3 枚選ぶと確定します。' : '1 枚選ぶと確定します。'}
        {picked.length > 0 && <> 選択中: {picked.map(showCard).join(' ')}</>}
      </p>
      <div className="picker">
        {SUITS.map((s) => (
          <div key={s} className={`prow${s === 'h' || s === 'd' ? ' red' : ''}`}>
            <span className="smark" aria-hidden>
              {SUIT_MARK[s]}
            </span>
            {[...RANK_CHARS].map((r) => {
              const c = `${r}${s}`;
              const off = used.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className={picked.includes(c) ? 'on' : ''}
                  disabled={off}
                  aria-label={showCard(c)}
                  onClick={() => toggle(c)}
                >
                  {r === 'T' ? '10' : r}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
