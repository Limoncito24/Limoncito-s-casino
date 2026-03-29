"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type PracticeState = {
  deck: string[];
  playerHand: string[];
  dealerHand: string[];
  roundStarted: boolean;
  roundFinished: boolean;
  dealerRevealed: boolean;
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
    playerHand: [],
    dealerHand: [],
    roundStarted: false,
    roundFinished: false,
    dealerRevealed: false,
    message: "Start a practice round",
  });

  function startRound() {
    const deck = createDeck();
    const playerHand = [deck.pop()!, deck.pop()!];
    const dealerHand = [deck.pop()!, deck.pop()!];

    setState({
      deck,
      playerHand,
      dealerHand,
      roundStarted: true,
      roundFinished: false,
      dealerRevealed: false,
      message: "Practice round started",
    });
  }

  function hit() {
    if (!state.roundStarted || state.roundFinished) return;

    const deck = [...state.deck];
    const card = deck.pop();
    if (!card) return;

    const playerHand = [...state.playerHand, card];
    const total = calculateHandTotal(playerHand);

    if (total > 21) {
      setState({
        ...state,
        deck,
        playerHand,
        roundFinished: true,
        dealerRevealed: true,
        message: "Bust",
      });
      return;
    }

    setState({
      ...state,
      deck,
      playerHand,
      message: `You drew ${card}`,
    });
  }

  function stand() {
    if (!state.roundStarted || state.roundFinished) return;

    const deck = [...state.deck];
    const dealerHand = [...state.dealerHand];

    while (calculateHandTotal(dealerHand) < 17 && deck.length > 0) {
      dealerHand.push(deck.pop()!);
    }

    const playerTotal = calculateHandTotal(state.playerHand);
    const dealerTotal = calculateHandTotal(dealerHand);

    let message = "Push";
    if (dealerTotal > 21) message = "Dealer busts - you win";
    else if (playerTotal > dealerTotal) message = "You win";
    else if (playerTotal < dealerTotal) message = "Dealer wins";

    setState({
      ...state,
      deck,
      dealerHand,
      roundFinished: true,
      dealerRevealed: true,
      message,
    });
  }

  const playerTotal = useMemo(
    () => calculateHandTotal(state.playerHand),
    [state.playerHand]
  );

  const dealerVisibleCards = state.dealerRevealed
    ? state.dealerHand
    : state.dealerHand.map((card, index) => (index === 0 ? card : "HIDDEN"));

  const dealerVisibleTotal = state.dealerRevealed
    ? calculateHandTotal(state.dealerHand)
    : state.dealerHand.length > 0
    ? calculateHandTotal([state.dealerHand[0]])
    : 0;

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

          <div className="max-w-2xl mx-auto rounded-2xl p-4 border border-yellow-400 bg-yellow-400/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-lg">You</p>
                <p className="text-sm text-white/70">Total: {state.playerHand.length ? playerTotal : 0}</p>
              </div>
              <div className="text-sm text-right">
                {playerTotal > 21 ? (
                  <p className="text-red-300">Busted</p>
                ) : state.roundFinished ? (
                  <p className="text-yellow-300">Round done</p>
                ) : (
                  <p className="text-green-300">Playing</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap min-h-[110px]">
              {state.playerHand.length === 0 ? (
                <p className="text-white/60">No cards yet</p>
              ) : (
                state.playerHand.map((card, index) => (
                  <Card key={`${card}-${index}`} card={card} />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-black/20 border border-white/10 p-5 space-y-3 max-w-sm mx-auto">
          <h2 className="text-2xl font-bold text-yellow-300">Actions</h2>

          <button
            onClick={startRound}
            className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-semibold"
          >
            Start Round
          </button>

          <button
            onClick={hit}
            disabled={!state.roundStarted || state.roundFinished}
            className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Hit
          </button>

          <button
            onClick={stand}
            disabled={!state.roundStarted || state.roundFinished}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Stand
          </button>
        </div>
      </div>
    </main>
  );
}