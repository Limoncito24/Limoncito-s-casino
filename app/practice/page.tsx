"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PracticeHand = {
  cards: string[];
  bet: number;
  done: boolean;
  busted: boolean;
  surrendered: boolean;
  doubled: boolean;
  result?: "win" | "lose" | "push" | "bust" | "surrender";
};

type PracticeState = {
  deck: string[];
  playerHands: PracticeHand[];
  activeHandIndex: number;
  dealerHand: string[];
  roundStarted: boolean;
  roundFinished: boolean;
  dealerRevealed: boolean;
  bankroll: number;
  betInput: number;
  message: string;
};

function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: string[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function getCardRank(card: string) {
  return card.slice(0, -1);
}

function getCardSuit(card: string) {
  return card.slice(-1);
}

function getCardValue(card: string) {
  const rank = getCardRank(card);

  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number(rank);
}

function calculateHandTotal(cards: string[]) {
  let total = cards.reduce((sum, card) => sum + getCardValue(card), 0);
  let aces = cards.filter((card) => getCardRank(card) === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function getCardColor(card: string) {
  const suit = getCardSuit(card);
  return suit === "♥" || suit === "♦" ? "text-red-500" : "text-black";
}

function Card({ card, hidden = false }: { card: string; hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="w-16 h-24 rounded-xl bg-blue-700 border-2 border-white/30 flex items-center justify-center shadow-lg">
        <div className="w-10 h-16 rounded-lg border border-white/30 bg-blue-500/40" />
      </div>
    );
  }

  return (
    <div className="w-16 h-24 rounded-xl bg-white border-2 border-gray-300 shadow-lg p-2 flex flex-col justify-between">
      <div className={`text-sm font-bold ${getCardColor(card)}`}>{card}</div>
      <div className={`text-2xl text-center ${getCardColor(card)}`}>{getCardSuit(card)}</div>
      <div className={`text-sm font-bold rotate-180 self-end ${getCardColor(card)}`}>{card}</div>
    </div>
  );
}

export default function PracticePage() {
  const [state, setState] = useState<PracticeState>({
    deck: [],
    playerHands: [],
    activeHandIndex: 0,
    dealerHand: [],
    roundStarted: false,
    roundFinished: false,
    dealerRevealed: false,
    bankroll: 1000,
    betInput: 100,
    message: "Start a practice round",
  });

  const activeHand = state.playerHands[state.activeHandIndex];
  const canAct = state.roundStarted && !state.roundFinished && !!activeHand && !activeHand.done;

  function startRound() {
    if (state.bankroll <= 0) {
      setState((prev) => ({
        ...prev,
        message: "You are out of bankroll.",
      }));
      return;
    }

    const deck = createDeck();
    const bet = Math.max(1, Math.min(state.betInput, state.bankroll));

    const playerHands: PracticeHand[] = [
      {
        cards: [deck.pop()!, deck.pop()!],
        bet,
        done: false,
        busted: false,
        surrendered: false,
        doubled: false,
      },
    ];

    const dealerHand = [deck.pop()!, deck.pop()!];

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      activeHandIndex: 0,
      dealerHand,
      roundStarted: true,
      roundFinished: false,
      dealerRevealed: false,
      message: `Practice round started. Bet: $${bet}`,
    }));
  }

  function hit() {
    if (!canAct) return;

    const deck = [...state.deck];
    const card = deck.pop();
    if (!card) return;

    const playerHands = [...state.playerHands];
    const hand = { ...playerHands[state.activeHandIndex] };
    hand.cards = [...hand.cards, card];

    const handTotal = calculateHandTotal(hand.cards);
    if (handTotal > 21) {
      hand.busted = true;
      hand.done = true;
      hand.result = "bust";
    }

    playerHands[state.activeHandIndex] = hand;

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      roundFinished: hand.done,
      message: hand.busted ? `You drew ${card} and busted` : `You drew ${card}`,
    }));
  }

  function stand() {
    if (!canAct) return;

    const playerHands = [...state.playerHands];
    playerHands[state.activeHandIndex] = {
      ...playerHands[state.activeHandIndex],
      done: true,
    };

    setState((prev) => ({
      ...prev,
      playerHands,
      roundFinished: true,
      message: "You stood. Run dealer.",
    }));
  }

  function doubleDown() {
    if (!canAct) return;

    const hand = state.playerHands[state.activeHandIndex];
    if (!hand) return;

    if (hand.bet > state.bankroll) {
      setState((prev) => ({
        ...prev,
        message: "Not enough bankroll to double down.",
      }));
      return;
    }

    const deck = [...state.deck];
    const card = deck.pop();
    if (!card) return;

    const playerHands = [...state.playerHands];
    const doubledHand: PracticeHand = {
      ...hand,
      bet: hand.bet * 2,
      doubled: true,
      done: true,
      cards: [...hand.cards, card],
    };

    const handTotal = calculateHandTotal(doubledHand.cards);
    if (handTotal > 21) {
      doubledHand.busted = true;
      doubledHand.result = "bust";
    }

    playerHands[state.activeHandIndex] = doubledHand;

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      roundFinished: true,
      message: `You doubled down and drew ${card}`,
    }));
  }

  function surrender() {
    if (!canAct) return;

    const playerHands = [...state.playerHands];
    playerHands[state.activeHandIndex] = {
      ...playerHands[state.activeHandIndex],
      surrendered: true,
      done: true,
      result: "surrender",
    };

    setState((prev) => ({
      ...prev,
      playerHands,
      roundFinished: true,
      message: "You surrendered. Run dealer.",
    }));
  }

  function runDealer() {
    if (!state.roundFinished || state.dealerRevealed) return;

    const deck = [...state.deck];
    const dealerHand = [...state.dealerHand];

    while (calculateHandTotal(dealerHand) < 17 && deck.length > 0) {
      dealerHand.push(deck.pop()!);
    }

    const dealerTotal = calculateHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;

    let bankrollChange = 0;

    const playerHands = state.playerHands.map((hand) => {
      if (hand.surrendered) {
        bankrollChange -= Math.floor(hand.bet / 2);
        return { ...hand, result: "surrender" as const };
      }

      if (hand.busted) {
        bankrollChange -= hand.bet;
        return { ...hand, result: "bust" as const };
      }

      const handTotal = calculateHandTotal(hand.cards);

      if (dealerBust || handTotal > dealerTotal) {
        bankrollChange += hand.bet;
        return { ...hand, result: "win" as const };
      }

      if (handTotal < dealerTotal) {
        bankrollChange -= hand.bet;
        return { ...hand, result: "lose" as const };
      }

      return { ...hand, result: "push" as const };
    });

    let summary = "Dealer finished.";
    const firstResult = playerHands[0]?.result;

    if (firstResult === "win") summary = "You win";
    if (firstResult === "lose") summary = "Dealer wins";
    if (firstResult === "push") summary = "Push";
    if (firstResult === "bust") summary = "Bust";
    if (firstResult === "surrender") summary = "Surrendered";

    setState((prev) => ({
      ...prev,
      deck,
      dealerHand,
      dealerRevealed: true,
      playerHands,
      bankroll: prev.bankroll + bankrollChange,
      message: `${summary} (${bankrollChange >= 0 ? "+" : ""}$${bankrollChange})`,
    }));
  }

  const dealerVisibleCards = state.dealerRevealed
    ? state.dealerHand
    : state.dealerHand.map((card, index) => (index === 0 ? card : "HIDDEN"));

  const dealerVisibleTotal = state.dealerRevealed
    ? calculateHandTotal(state.dealerHand)
    : state.dealerHand.length > 0
      ? calculateHandTotal([state.dealerHand[0]])
      : 0;

  const results = useMemo(() => {
    if (!state.dealerRevealed) return [];

    return state.playerHands.map((hand, index) => {
      const handTotal = calculateHandTotal(hand.cards);
      return `Hand ${index + 1}: ${hand.result || "done"} (${handTotal})`;
    });
  }, [state.dealerRevealed, state.playerHands]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 via-green-900 to-green-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-3xl border border-yellow-400/20 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold text-yellow-300">Practice Table</h1>
              <p className="text-white/75 mt-1">{state.message}</p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/admin"
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl"
              >
                Admin
              </Link>
              <Link
                href="/lobby"
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl"
              >
                Multiplayer Lobby
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border-4 border-yellow-700 bg-green-800 shadow-2xl p-6 space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-yellow-300">Dealer</h2>
            <p>Total: {dealerVisibleTotal}</p>

            <div className="flex justify-center gap-3 flex-wrap min-h-[110px]">
              {dealerVisibleCards.length === 0 ? (
                <p className="text-white/70">No dealer cards yet</p>
              ) : (
                dealerVisibleCards.map((card, index) =>
                  card === "HIDDEN" ? (
                    <Card key={`hidden-${index}`} card="??" hidden />
                  ) : (
                    <Card key={`${card}-${index}`} card={card} />
                  )
                )
              )}
            </div>
          </div>

          <div className="max-w-3xl mx-auto rounded-2xl p-4 border border-yellow-400 bg-yellow-400/10">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div>
                <p className="font-bold text-lg">You</p>
                <p className="text-sm text-yellow-300">Bankroll: ${state.bankroll}</p>
              </div>

              {!state.roundStarted && (
                <div>
                  <label className="text-sm text-white/70 block mb-1">Bet</label>
                  <input
                    type="number"
                    min={1}
                    max={state.bankroll}
                    value={state.betInput}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        betInput: Number(e.target.value || 1),
                      }))
                    }
                    className="rounded-lg px-3 py-2 text-black w-32"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {state.playerHands.length === 0 ? (
                <p className="text-white/60">No cards yet</p>
              ) : (
                state.playerHands.map((hand, index) => {
                  const handTotal = calculateHandTotal(hand.cards);
                  const isActive = index === state.activeHandIndex && !hand.done;

                  return (
                    <div
                      key={`hand-${index}`}
                      className={`rounded-xl p-3 border ${
                        isActive
                          ? "border-yellow-400 bg-yellow-400/10"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold">
                          Hand {index + 1} · Total {handTotal}
                        </p>
                        <p className="text-sm text-white/70">Bet ${hand.bet}</p>
                      </div>

                      <div className="flex gap-2 flex-wrap min-h-[110px]">
                        {hand.cards.map((card, cardIndex) => (
                          <Card key={`${card}-${cardIndex}`} card={card} />
                        ))}
                      </div>

                      <div className="mt-2 text-sm text-white/75">
                        {hand.busted && <p className="text-red-300">Busted</p>}
                        {hand.surrendered && <p className="text-orange-300">Surrendered</p>}
                        {hand.doubled && <p className="text-blue-300">Doubled down</p>}
                        {hand.result && <p className="text-yellow-300">Result: {hand.result}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-black/20 border border-white/10 p-5 space-y-3 max-w-sm mx-auto">
          <h2 className="text-2xl font-bold text-yellow-300">Actions</h2>

          <button
            onClick={startRound}
            disabled={state.roundStarted && !state.dealerRevealed}
            className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Start Round
          </button>

          <button
            onClick={hit}
            disabled={!canAct}
            className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Hit
          </button>

          <button
            onClick={stand}
            disabled={!canAct}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Stand
          </button>

          <button
            onClick={doubleDown}
            disabled={!canAct}
            className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Double Down
          </button>

          <button
            onClick={surrender}
            disabled={!canAct}
            className="w-full bg-orange-600 hover:bg-orange-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Surrender
          </button>

          <button
            onClick={runDealer}
            disabled={!state.roundFinished || state.dealerRevealed}
            className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Run Dealer
          </button>
        </div>

        {state.dealerRevealed && (
          <div className="rounded-3xl bg-black/20 border border-white/10 p-5">
            <h2 className="text-2xl font-bold text-yellow-300 mb-3">Results</h2>
            <div className="grid md:grid-cols-2 gap-2">
              {results.map((result) => (
                <div key={result} className="rounded-xl bg-white/5 p-3">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}