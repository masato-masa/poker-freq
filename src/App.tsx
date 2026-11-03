import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { showCard } from '@/lib/board';
import { handClass } from '@/lib/hand';
import {
  STACK_FILTERS,
  STAKES,
  TABLE_SIZES,
  actionLabel,
  apply,
  candidates,
  initState,
  liveSeats,
  seatNames,
  type PreflopIndex,
  type StackFilter,
  type Stake,
  type State,
} from '@/lib/engine';
import {
  applyPost,
  candidatesPost,
  labelPost,
  liveOf,
  nextStreet,
  roundDone,
  startPost,
  type PostIndex,
  type PostState,
} from '@/lib/postflop';

import { CardPicker } from './ui/CardPicker';
import { Panel } from './ui/Panel';
import { PostPanel } from './ui/PostPanel';
import { Table, type TableView } from './ui/Table';

interface Game {
  pre: State;
  post: PostState | null;
}

/** 選んだ行動の履歴。game はその行動を選んだあとの状態。 */
interface Step {
  game: Game;
  text: string;
}

const newGame = (n: number): Step[] => [{ game: { pre: initState(n), post: null }, text: '' }];

export function App() {
  const [index, setIndex] = useState<PreflopIndex | null>(null);
  const [postIndex, setPostIndex] = useState<PostIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState<number>(9);
  const [stack, setStack] = useState<StackFilter>('all');
  const [stake, setStake] = useState<Stake>('all');
  const [steps, setSteps] = useState<Step[]>(newGame(9));
  const [picked, setPicked] = useState<number | null>(null);
  /** 自分の手札（2 枚）。履歴には含めず、どの局面でも保つ */
  const [hand, setHand] = useState<string[] | null>(null);
  const [pickingHand, setPickingHand] = useState(false);
  const cache = useRef(new Map<Stake, PreflopIndex>());
  const postCache = useRef(new Map<Stake, PostIndex>());

  const { pre, post } = steps[steps.length - 1].game;
  const names = seatNames(n);

  // 局面の段階: pre=プリフロップ / flop=フロップのカード待ち / post=ポストフロップ(動く席がいる) / card=ターン・リバーのカード待ち / end=終了
  const preCands = useMemo(() => candidates(pre), [pre]);
  const phase = !post
    ? preCands.length > 0
      ? 'pre'
      : liveSeats(pre).length >= 2
        ? 'flop'
        : 'end'
    : liveOf(post).length <= 1
      ? 'end'
      : !roundDone(post)
        ? 'post'
        : post.street === 'river'
          ? 'end'
          : 'card';

  // ステークを変えるたびに、そのプリフロップ索引を読む（一度読んだものは持っておく）
  useEffect(() => {
    const hit = cache.current.get(stake);
    if (hit) {
      setIndex(hit);
      return;
    }
    let alive = true;
    setIndex(null);
    setError(null);
    const file = STAKES.find((s) => s.id === stake)!.file;
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PreflopIndex>;
      })
      .then((d) => {
        cache.current.set(stake, d);
        if (alive) setIndex(d);
      })
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [stake]);

  // フロップに進んだら、ポストフロップの索引も読む
  const wantPost = phase === 'flop' || post !== null;
  useEffect(() => {
    if (!wantPost) return;
    const hit = postCache.current.get(stake);
    if (hit) {
      setPostIndex(hit);
      return;
    }
    let alive = true;
    setPostIndex(null);
    fetch(`${import.meta.env.BASE_URL}data/post-${stake}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PostIndex>;
      })
      .then((d) => {
        postCache.current.set(stake, d);
        if (alive) setPostIndex(d);
      })
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [stake, wantPost]);

  const cands = phase === 'pre' ? preCands : phase === 'post' && post ? candidatesPost(post) : [];
  // 選択中の席が動けなくなったら、いま動ける最初の席に移す
  const seat = picked !== null && cands.includes(picked) ? picked : (cands[0] ?? null);

  const changeSize = useCallback((size: number) => {
    setN(size);
    setSteps(newGame(size));
    setPicked(null);
  }, []);

  const push = useCallback((game: Game, text: string) => {
    setSteps((st) => [...st, { game, text }]);
    setPicked(null);
  }, []);

  const commit = (s: number, code: string) => {
    if (post) {
      push({ pre, post: applyPost(post, s, code) }, `${names[s]} ${labelPost(code)}`);
    } else {
      push({ pre: apply(pre, s, code), post: null }, `${names[s]} ${actionLabel(code, pre.nraise, s, n)}`);
    }
  };

  const deal = (cards: string[]) => {
    if (!post) push({ pre, post: startPost(pre, cards) }, `フロップ ${cards.map(showCard).join(' ')}`);
    else push({ pre, post: nextStreet(post, cards[0]) }, `${post.street === 'flop' ? 'ターン' : 'リバー'} ${showCard(cards[0])}`);
  };

  const undo = () => {
    setSteps((st) => (st.length > 1 ? st.slice(0, -1) : st));
    setPicked(null);
  };
  const reset = () => {
    setSteps(newGame(n));
    setPicked(null);
  };

  // 円卓に出す内容
  const view: TableView = post
    ? {
        n,
        folded: post.folded,
        acted: post.acted,
        candidates: cands,
        selected: seat,
        board: post.board,
        status:
          phase === 'end'
            ? liveOf(post).length <= 1
              ? `${names[liveOf(post)[0]]} の勝ち`
              : 'ショーダウン'
            : phase === 'card'
              ? `${post.street === 'flop' ? 'ターン' : 'リバー'}のカードを選ぶ`
              : '',
      }
    : {
        n,
        folded: pre.folded,
        acted: pre.acted,
        candidates: cands,
        selected: seat,
        board: [],
        status:
          phase === 'flop'
            ? 'フロップのカードを選ぶ'
            : phase === 'end'
              ? `${names[liveSeats(pre)[0]]} の勝ち（全員フォールド）`
              : '',
      };

  const canUndo = steps.length > 1;
  const resetButtons = (
    <div className="actions">
      <button type="button" onClick={undo} disabled={!canUndo}>
        ひとつ戻る
      </button>
      <button type="button" onClick={reset} disabled={!canUndo}>
        最初から
      </button>
    </div>
  );

  const handInfo = hand ? { cards: hand, cls: handClass(hand[0], hand[1]) } : null;
  const boardCards = post?.board ?? [];

  let panel;
  if (pickingHand) {
    panel = (
      <CardPicker
        key="hand"
        title="自分の手札を選ぶ"
        need={2}
        used={boardCards}
        onDone={(cards) => {
          setHand(cards);
          setPickingHand(false);
        }}
      />
    );
  } else if (phase === 'flop') {
    panel = <CardPicker key="flop" title="フロップを選ぶ" need={3} used={hand ?? []} onDone={deal} />;
  } else if (phase === 'card' && post) {
    panel = (
      <CardPicker
        key={post.street}
        title={post.street === 'flop' ? 'ターンを選ぶ' : 'リバーを選ぶ'}
        need={1}
        used={[...(hand ?? []), ...post.board]}
        onDone={deal}
      />
    );
  } else if (phase === 'post' && post && seat !== null) {
    panel = (
      <PostPanel
        key={steps.length}
        index={postIndex}
        loading={!error}
        hasHand={hand !== null}
        post={post}
        seat={seat}
        stack={stack}
        onCommit={commit}
        onUndo={undo}
        onReset={reset}
      />
    );
  } else if (phase === 'end') {
    panel = (
      <div className="panel">
        <h2>{post ? (liveOf(post).length <= 1 ? 'ハンド終了' : 'ショーダウン') : 'プリフロップ終了'}</h2>
        <p className="note">
          {post && liveOf(post).length > 1
            ? `リバーまで進みました。残り ${liveOf(post).length} 人。`
            : '全員が下りました。'}
          別の流れを試すときは「ひとつ戻る」か「最初から」を押してください。
        </p>
        {resetButtons}
      </div>
    );
  } else if (index) {
    panel = (
      <Panel
        hand={handInfo}
        index={index}
        state={pre}
        seat={seat}
        stack={stack}
        onCommit={commit}
        onUndo={undo}
        onReset={reset}
        canUndo={canUndo}
      />
    );
  } else {
    panel = <div className="panel">{error ? `データを読めませんでした: ${error}` : 'データを読み込み中…'}</div>;
  }

  const flow = steps.slice(1).map((s) => s.text);

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
        <div className="seg" role="group" aria-label="ステーク">
          {STAKES.map((s) => (
            <button key={s.id} type="button" className={s.id === stake ? 'on' : ''} onClick={() => setStake(s.id)}>
              {s.label}
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

      <div className="handbar">
        <button type="button" className={`handbtn${hand ? ' set' : ''}`} onClick={() => setPickingHand((v) => !v)}>
          {hand ? (
            <>
              手札 <span className="cards">{hand.map(showCard).join(' ')}</span>（{handInfo!.cls}）
            </>
          ) : (
            '自分の手札を入れる'
          )}
        </button>
        {hand && (
          <button type="button" className="handclear" onClick={() => setHand(null)}>
            クリア
          </button>
        )}
      </div>

      <main className="main">
        <div>
          <Table view={view} onPick={setPicked} />
          {flow.length > 0 && (
            <ol className="flow" aria-label="ここまでの流れ">
              {flow.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          )}
        </div>
        {panel}
      </main>

      <footer className="foot">
        データ: HandHQ のオンライン・キャッシュのハンド履歴（2009 年 7 月、PokerStars のノーリミット 25NL〜1000NL、
        {index ? `この選択は ${index.meta.hands.toLocaleString()} ハンド` : '読み込み中'}）を
        <a href="https://github.com/uoftcprg/phh-dataset">トロント大学の PHH データセット</a>
        （CC BY 4.0）から集計。手札は伏せられているので、頻度は「全員の」行動です。
      </footer>
    </div>
  );
}
