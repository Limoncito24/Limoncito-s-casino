"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PracticeResult =
  | "win"
  | "lose"
  | "push"
  | "bust"
  | "surrender"
  | "blackjack";

type PracticeHand = {
  cards: string[];
  bet: number;
  busterBet: number;
  done: boolean;
  busted: boolean;
  surrendered: boolean;
  doubled: boolean;
  blackjack: boolean;
  result?: PracticeResult;
  busterWon?: boolean;
  busterPayout?: number;
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
  busterBetInput: number;
  confirmedBet: boolean;
  message: string;
};

const LOCAL_STORAGE_BANKROLL_KEY = "blackjack_practice_bankroll";
const LOCAL_STORAGE_BET_KEY = "blackjack_practice_bet";
const LOCAL_STORAGE_BUSTER_KEY = "blackjack_practice_buster";

function createDecks(deckCount: number) {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: string[] = [];

  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(`${rank}${suit}`);
      }
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

function isBlackjack(cards: string[]) {
  return cards.length === 2 && calculateHandTotal(cards) === 21;
}

function getBusterMultiplier(cardCount: number) {
  if (cardCount >= 7) return 50;
  if (cardCount === 6) return 10;
  if (cardCount === 5) return 3;
  if (cardCount === 4) return 2;
  if (cardCount === 3) return 2;
  return 0;
}

function canSplitRanks(a: string, b: string) {
  const rankA = getCardRank(a);
  const rankB = getCardRank(b);
  const tenValue = ["10", "J", "Q", "K"];

  if (tenValue.includes(rankA) && tenValue.includes(rankB)) {
    return true;
  }

  return rankA === rankB;
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
    busterBetInput: 0,
    confirmedBet: false,
    message: "Set your bet and start a practice round",
  });

  useEffect(() => {
    const savedBankroll = Number(localStorage.getItem(LOCAL_STORAGE_BANKROLL_KEY) || 1000);
    const savedBet = Number(localStorage.getItem(LOCAL_STORAGE_BET_KEY) || 100);
    const savedBuster = Number(localStorage.getItem(LOCAL_STORAGE_BUSTER_KEY) || 0);

    setState((prev) => ({
      ...prev,
      bankroll: savedBankroll,
      betInput: savedBet,
      busterBetInput: savedBuster === 5 ? 5 : 0,
    }));
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_BANKROLL_KEY, String(state.bankroll));
  }, [state.bankroll]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_BET_KEY, String(state.betInput));
  }, [state.betInput]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_BUSTER_KEY, String(state.busterBetInput));
  }, [state.busterBetInput]);

  const activeHand = state.playerHands[state.activeHandIndex];
  const canAct =
    state.roundStarted &&
    !state.roundFinished &&
    !!activeHand &&
    !activeHand.done &&
    !state.dealerRevealed;

  function moveToNextHand(updatedHands: PracticeHand[]) {
    const nextIndex = updatedHands.findIndex((hand) => !hand.done);
    const allDone = updatedHands.every((hand) => hand.done);

    return {
      nextIndex: nextIndex === -1 ? 0 : nextIndex,
      allDone,
    };
  }

  function saveBet() {
    setState((prev) => ({
      ...prev,
      confirmedBet: true,
      message: `Bet saved: main $${prev.betInput} · buster $${prev.busterBetInput}`,
    }));
  }

  function startRound() {
    if (state.bankroll <= 0) {
      setState((prev) => ({
        ...prev,
        message: "You are out of bankroll.",
      }));
      return;
    }

    const finalBuster = state.busterBetInput === 5 ? 5 : 0;
    const maxMainBet = Math.max(1, state.bankroll - finalBuster);
    const finalBet = Math.min(Math.max(1, state.betInput), maxMainBet);

    if (state.bankroll < finalBet + finalBuster) {
      setState((prev) => ({
        ...prev,
        message: "Not enough bankroll for that bet.",
      }));
      return;
    }

    const deck = createDecks(3);
    const playerCards = [deck.pop()!, deck.pop()!];
    const dealerHand = [deck.pop()!, deck.pop()!];
    const blackjack = isBlackjack(playerCards);
    const dealerHasBlackjack = isBlackjack(dealerHand);

    const playerHands: PracticeHand[] = [
      {
        cards: playerCards,
        bet: finalBet,
        busterBet: finalBuster,
        done: blackjack,
        busted: false,
        surrendered: false,
        doubled: false,
        blackjack,
        result: blackjack ? "blackjack" : undefined,
        busterWon: false,
        busterPayout: 0,
      },
    ];

    const nextState: PracticeState = {
      ...state,
      deck,
      playerHands,
      activeHandIndex: 0,
      dealerHand,
      roundStarted: true,
      roundFinished: dealerHasBlackjack || blackjack,
      dealerRevealed: dealerHasBlackjack,
      confirmedBet: false,
      message: dealerHasBlackjack ? "Dealer has blackjack." : "Practice round started",
    };

    if (dealerHasBlackjack) {
      settleRound(nextState, dealerHand);
      return;
    }

    if (blackjack) {
      setState({
        ...nextState,
        message: "Blackjack! Run dealer.",
      });
      return;
    }

    setState(nextState);
  }

  function hit() {
    if (!canAct) return;

    const deck = [...state.deck];
    const card = deck.pop();
    if (!card) return;

    const playerHands = [...state.playerHands];
    const hand = { ...playerHands[state.activeHandIndex] };

    hand.cards = [...hand.cards, card];
    hand.blackjack = false;

    const handTotal = calculateHandTotal(hand.cards);

    if (handTotal > 21) {
      hand.busted = true;
      hand.done = true;
      hand.result = "bust";
    }

    playerHands[state.activeHandIndex] = hand;

    const { nextIndex, allDone } = moveToNextHand(playerHands);

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      activeHandIndex: allDone ? prev.activeHandIndex : nextIndex,
      roundFinished: allDone,
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

    const { nextIndex, allDone } = moveToNextHand(playerHands);

    setState((prev) => ({
      ...prev,
      playerHands,
      activeHandIndex: allDone ? prev.activeHandIndex : nextIndex,
      roundFinished: allDone,
      message: allDone ? "All hands done. Run dealer." : `Move to hand ${nextIndex + 1}`,
    }));
  }

  function doubleDown() {
    if (!canAct) return;

    const hand = state.playerHands[state.activeHandIndex];
    if (!hand) return;

    if (state.bankroll < hand.bet * 2 + hand.busterBet) {
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
      blackjack: false,
      cards: [...hand.cards, card],
    };

    const handTotal = calculateHandTotal(doubledHand.cards);

    if (handTotal > 21) {
      doubledHand.busted = true;
      doubledHand.result = "bust";
    }

    playerHands[state.activeHandIndex] = doubledHand;

    const { nextIndex, allDone } = moveToNextHand(playerHands);

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      activeHandIndex: allDone ? prev.activeHandIndex : nextIndex,
      roundFinished: allDone,
      message: allDone
        ? `You doubled down and drew ${card}`
        : `You doubled down and drew ${card}. Move to hand ${nextIndex + 1}`,
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

    const { nextIndex, allDone } = moveToNextHand(playerHands);

    setState((prev) => ({
      ...prev,
      playerHands,
      activeHandIndex: allDone ? prev.activeHandIndex : nextIndex,
      roundFinished: allDone,
      message: allDone ? "You surrendered. Run dealer." : `Move to hand ${nextIndex + 1}`,
    }));
  }

  function splitHand() {
    if (!canAct) return;

    const hand = state.playerHands[state.activeHandIndex];
    if (!hand) return;

    if (hand.cards.length !== 2 || hand.done || hand.doubled) {
      setState((prev) => ({
        ...prev,
        message: "You can only split your first 2 cards.",
      }));
      return;
    }

    const [card1, card2] = hand.cards;

    if (!canSplitRanks(card1, card2)) {
      setState((prev) => ({
        ...prev,
        message: "Cards must match rank or both be 10-value cards to split.",
      }));
      return;
    }

    if (state.bankroll < hand.bet * 2 + hand.busterBet) {
      setState((prev) => ({
        ...prev,
        message: "Not enough bankroll to split.",
      }));
      return;
    }

    const deck = [...state.deck];
    const newCard1 = deck.pop();
    const newCard2 = deck.pop();

    if (!newCard1 || !newCard2) {
      setState((prev) => ({
        ...prev,
        message: "Not enough cards left in shoe.",
      }));
      return;
    }

    const firstHand: PracticeHand = {
      cards: [card1, newCard1],
      bet: hand.bet,
      busterBet: hand.busterBet,
      done: false,
      busted: false,
      surrendered: false,
      doubled: false,
      blackjack: false,
      result: undefined,
      busterWon: false,
      busterPayout: 0,
    };

    const secondHand: PracticeHand = {
      cards: [card2, newCard2],
      bet: hand.bet,
      busterBet: 0,
      done: false,
      busted: false,
      surrendered: false,
      doubled: false,
      blackjack: false,
      result: undefined,
      busterWon: false,
      busterPayout: 0,
    };

    const playerHands = [...state.playerHands];
    playerHands.splice(state.activeHandIndex, 1, firstHand, secondHand);

    setState((prev) => ({
      ...prev,
      deck,
      playerHands,
      activeHandIndex: state.activeHandIndex,
      message: "Hand split. Play hand 1 first.",
    }));
  }

  function settleRound(baseState?: PracticeState, dealerOverride?: string[]) {
    const source = baseState ?? state;
    const deck = [...source.deck];
    const dealerHand = dealerOverride ? [...dealerOverride] : [...source.dealerHand];

    if (!isBlackjack(dealerHand)) {
      while (calculateHandTotal(dealerHand) < 17 && deck.length > 0) {
        dealerHand.push(deck.pop()!);
      }
    }

    const dealerTotal = calculateHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;
    const dealerBlackjack = isBlackjack(dealerHand);
    const busterMultiplier = dealerBust ? getBusterMultiplier(dealerHand.length) : 0;

    let bankrollChange = 0;

    const playerHands = source.playerHands.map((hand) => {
      const nextHand: PracticeHand = {
        ...hand,
        busterWon: false,
        busterPayout: 0,
      };

      if (hand.busterBet === 5) {
        if (dealerBust && busterMultiplier > 0) {
          const busterProfit = hand.busterBet * busterMultiplier;
          bankrollChange += busterProfit;
          nextHand.busterWon = true;
          nextHand.busterPayout = busterProfit;
        } else {
          bankrollChange -= hand.busterBet;
        }
      }

      if (hand.surrendered) {
        bankrollChange -= hand.bet / 2;
        nextHand.result = "surrender";
        return nextHand;
      }

      if (hand.busted) {
        bankrollChange -= hand.bet;
        nextHand.result = "bust";
        return nextHand;
      }

      const handTotal = calculateHandTotal(hand.cards);

      if (hand.blackjack) {
        if (dealerBlackjack) {
          nextHand.result = "push";
          return nextHand;
        }

        bankrollChange += hand.bet * 1.5;
        nextHand.result = "blackjack";
        return nextHand;
      }

      if (dealerBlackjack) {
        bankrollChange -= hand.bet;
        nextHand.result = "lose";
        return nextHand;
      }

      if (dealerBust || handTotal > dealerTotal) {
        bankrollChange += hand.bet;
        nextHand.result = "win";
        return nextHand;
      }

      if (handTotal < dealerTotal) {
        bankrollChange -= hand.bet;
        nextHand.result = "lose";
        return nextHand;
      }

      nextHand.result = "push";
      return nextHand;
    });

    let summary = "Dealer finished.";
    const wins = playerHands.filter((h) => h.result === "win" || h.result === "blackjack").length;
    const losses = playerHands.filter(
      (h) => h.result === "lose" || h.result === "bust" || h.result === "surrender"
    ).length;

    if (dealerBlackjack) summary = "Dealer has blackjack.";
    else if (dealerBust) summary = `Dealer busted (${dealerHand.length} cards)`;
    else if (wins > 0 && losses === 0) summary = "You win";
    else if (losses > 0 && wins === 0) summary = "Dealer wins";
    else if (wins > 0 && losses > 0) summary = "Mixed results";
    else summary = "Push";

    setState((prev) => ({
      ...prev,
      deck: [],
      dealerHand,
      dealerRevealed: true,
      playerHands,
      bankroll: Math.round((prev.bankroll + bankrollChange) * 100) / 100,
      roundStarted: false,
      roundFinished: true,
      confirmedBet: false,
      activeHandIndex: 0,
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

  const canSplit =
    canAct &&
    !!activeHand &&
    activeHand.cards.length === 2 &&
    canSplitRanks(activeHand.cards[0], activeHand.cards[1]) &&
    state.bankroll >= activeHand.bet * 2 + activeHand.busterBet;

  const results = useMemo(() => {
    if (!state.dealerRevealed) return [];

    return state.playerHands.map((hand, index) => {
      const handTotal = calculateHandTotal(hand.cards);
      const busterText = hand.busterWon ? ` + buster $${hand.busterPayout}` : "";
      return `Hand ${index + 1}: ${hand.result || "done"} (${handTotal})${busterText}`;
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
              <Link href="/admin" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl">
                Admin
              </Link>
              <Link href="/lobby" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl">
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

              {(!state.roundStarted || state.dealerRevealed) && (
                <div className="w-full sm:w-auto space-y-3">
                  <div>
                    <label className="text-sm text-white/70 block mb-2">Main Bet</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            betInput: Math.max(1, prev.betInput - 5),
                            confirmedBet: false,
                          }))
                        }
                        className="px-4 py-3 rounded-lg bg-white/10 text-white"
                      >
                        -5
                      </button>

                      <div className="w-full sm:w-32 rounded-lg px-3 py-3 bg-white text-black text-lg text-center font-semibold">
                        ${state.betInput}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            betInput: prev.betInput + 5,
                            confirmedBet: false,
                          }))
                        }
                        className="px-4 py-3 rounded-lg bg-white/10 text-white"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-white/70 block mb-2">Buster Bet</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            busterBetInput: 0,
                            confirmedBet: false,
                          }))
                        }
                        className={`py-3 rounded-lg font-semibold ${
                          state.busterBetInput === 0
                            ? "bg-gray-300 text-black"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        No Buster
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            busterBetInput: 5,
                            confirmedBet: false,
                          }))
                        }
                        className={`py-3 rounded-lg font-semibold ${
                          state.busterBetInput === 5
                            ? "bg-pink-400 text-black"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        $5 Buster
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={saveBet}
                    className={`w-full py-3 rounded-lg font-semibold ${
                      state.confirmedBet ? "bg-green-400 text-black" : "bg-yellow-400 text-black"
                    }`}
                  >
                    {state.confirmedBet ? "Bet Confirmed" : "Confirm Bet"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {state.playerHands.length === 0 ? (
                <p className="text-white/60">No cards yet</p>
              ) : (
                state.playerHands.map((hand, index) => {
                  const handTotal = calculateHandTotal(hand.cards);
                  const isActive =
                    index === state.activeHandIndex && !hand.done && !state.dealerRevealed;

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
                        <div className="text-right text-sm text-white/70">
                          <p>Main ${hand.bet}</p>
                          <p>Buster ${hand.busterBet}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap min-h-[110px]">
                        {hand.cards.map((card, cardIndex) => (
                          <Card key={`${index}-${card}-${cardIndex}`} card={card} />
                        ))}
                      </div>

                      <div className="mt-2 text-sm text-white/75">
                        {hand.blackjack && <p className="text-emerald-300">Blackjack</p>}
                        {hand.busted && <p className="text-red-300">Busted</p>}
                        {hand.surrendered && <p className="text-orange-300">Surrendered</p>}
                        {hand.doubled && <p className="text-blue-300">Doubled down</p>}
                        {hand.busterWon && (
                          <p className="text-pink-300">Buster won: +${hand.busterPayout}</p>
                        )}
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
            disabled={state.roundStarted && !state.roundFinished}
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
            onClick={splitHand}
            disabled={!canSplit}
            className="w-full bg-pink-600 hover:bg-pink-500 py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Split
          </button>

          <button
            onClick={() => settleRound()}
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