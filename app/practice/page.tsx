"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Card = {
  rank: string;
  suit: string;
  value: number;
  label: string;
};

type Hand = {
  cards: Card[];
  finished: boolean;
  surrendered?: boolean;
  doubled?: boolean;
  bet: number;
};

type Stats = {
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  busts: number;
  splits: number;
  doubles: number;
  surrenders: number;
  busterWins: number;
};

const DEFAULT_STATS: Stats = {
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
  busts: 0,
  splits: 0,
  doubles: 0,
  surrenders: 0,
  busterWins: 0,
};

const STARTING_BANKROLL = 1000;

function createDeck(): Card[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = [
    { rank: "A", value: 11 },
    { rank: "2", value: 2 },
    { rank: "3", value: 3 },
    { rank: "4", value: 4 },
    { rank: "5", value: 5 },
    { rank: "6", value: 6 },
    { rank: "7", value: 7 },
    { rank: "8", value: 8 },
    { rank: "9", value: 9 },
    { rank: "10", value: 10 },
    { rank: "J", value: 10 },
    { rank: "Q", value: 10 },
    { rank: "K", value: 10 },
  ];

  const deck: Card[] = [];

  for (let d = 0; d < 3; d++) {
    for (const suit of suits) {
      for (const r of ranks) {
        deck.push({
          rank: r.rank,
          suit,
          value: r.value,
          label: `${r.rank}${suit}`,
        });
      }
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function getHandValue(hand: Card[]): number {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === "A").length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && getHandValue(hand) === 21;
}

function getBusterMultiplier(cards: number) {
  if (cards >= 7) return 50;
  if (cards === 6) return 10;
  if (cards === 5) return 3;
  if (cards === 4) return 2;
  if (cards === 3) return 2;
  return 0;
}

export default function PracticePage() {
  const [deck, setDeck] = useState<Card[]>(createDeck());
  const [dealer, setDealer] = useState<Card[]>([]);
  const [hands, setHands] = useState<Hand[]>([]);
  const [activeHandIndex, setActiveHandIndex] = useState(0);
  const [message, setMessage] = useState("");

  const [bankroll, setBankroll] = useState(STARTING_BANKROLL);
  const [betAmount, setBetAmount] = useState(25);
  const [roundActive, setRoundActive] = useState(false);

  const [busterOn, setBusterOn] = useState(false);
  const [busterBet, setBusterBet] = useState(0);

  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);

  const [userId, setUserId] = useState<string | null>(null);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const lifetimeNet = useMemo(() => bankroll - STARTING_BANKROLL, [bankroll]);

  useEffect(() => {
    async function loadUserStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You need to sign in first.");
        setStatsLoaded(true);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("player_stats")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        setMessage("Could not load your stats.");
        setStatsLoaded(true);
        return;
      }

      setBankroll(data.bankroll ?? STARTING_BANKROLL);
      setStats({
        handsPlayed: data.hands_played ?? 0,
        wins: data.wins ?? 0,
        losses: data.losses ?? 0,
        pushes: data.pushes ?? 0,
        blackjacks: data.blackjacks ?? 0,
        busts: data.busts ?? 0,
        splits: data.splits ?? 0,
        doubles: data.doubles ?? 0,
        surrenders: data.surrenders ?? 0,
        busterWins: data.buster_wins ?? 0,
      });

      setStatsLoaded(true);
    }

    loadUserStats();
  }, []);

  useEffect(() => {
    async function saveStatsToSupabase() {
      if (!statsLoaded || !userId) return;

      const { error } = await supabase
        .from("player_stats")
        .update({
          bankroll,
          hands_played: stats.handsPlayed,
          wins: stats.wins,
          losses: stats.losses,
          pushes: stats.pushes,
          blackjacks: stats.blackjacks,
          busts: stats.busts,
          splits: stats.splits,
          doubles: stats.doubles,
          surrenders: stats.surrenders,
          buster_wins: stats.busterWins,
        })
        .eq("user_id", userId);

      if (error) {
        console.error("SAVE STATS ERROR:", error);
      }
    }

    saveStatsToSupabase();
  }, [bankroll, stats, statsLoaded, userId]);

  async function resetPracticeData() {
    setStats(DEFAULT_STATS);
    setBankroll(STARTING_BANKROLL);
    setMessage("Practice stats and bankroll reset.");

    if (!userId) return;

    const { error } = await supabase
      .from("player_stats")
      .update({
        bankroll: STARTING_BANKROLL,
        hands_played: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        blackjacks: 0,
        busts: 0,
        splits: 0,
        doubles: 0,
        surrenders: 0,
        buster_wins: 0,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("RESET ERROR:", error);
    }
  }

  function drawFromDeck(currentDeck: Card[]) {
    const nextDeck = [...currentDeck];
    const card = nextDeck.pop();

    if (!card) {
      throw new Error("Deck is empty.");
    }

    return { card, nextDeck };
  }

  function canSplitHand(hand: Hand) {
    if (hand.cards.length !== 2) return false;

    const c1 = hand.cards[0];
    const c2 = hand.cards[1];

    return c1.rank === c2.rank || (c1.value === 10 && c2.value === 10);
  }

  function canSplit() {
    if (hands.length === 0) return false;
    const currentHand = hands[activeHandIndex];
    return !currentHand.finished && canSplitHand(currentHand);
  }

  function canDouble() {
    if (hands.length === 0) return false;
    const currentHand = hands[activeHandIndex];
    return !currentHand.finished && currentHand.cards.length === 2;
  }

  function deal() {
    if (roundActive) {
      setMessage("Finish the current hand first.");
      return;
    }

    if (betAmount <= 0) {
      setMessage("Bet must be more than 0.");
      return;
    }

    const totalCost = betAmount + (busterOn ? 5 : 0);

    if (totalCost > bankroll) {
      setMessage("Not enough chips.");
      return;
    }

    let workingDeck = createDeck();

    const p1 = drawFromDeck(workingDeck);
    workingDeck = p1.nextDeck;

    const d1 = drawFromDeck(workingDeck);
    workingDeck = d1.nextDeck;

    const p2 = drawFromDeck(workingDeck);
    workingDeck = p2.nextDeck;

    const d2 = drawFromDeck(workingDeck);
    workingDeck = d2.nextDeck;

    const playerCards = [p1.card, p2.card];
    const dealerCards = [d1.card, d2.card];
    const currentBusterBet = busterOn ? 5 : 0;

    setDeck(workingDeck);
    setDealer(dealerCards);
    setHands([
      {
        cards: playerCards,
        finished: false,
        bet: betAmount,
      },
    ]);
    setActiveHandIndex(0);
    setRoundActive(true);
    setBankroll((prev) => prev - totalCost);
    setBusterBet(currentBusterBet);

    const playerBJ = isBlackjack(playerCards);
    const dealerBJ = isBlackjack(dealerCards);

    if (playerBJ || dealerBJ) {
      let payout = 0;
      let roundMessage = "";

      if (playerBJ && dealerBJ) {
        payout = betAmount + betAmount * 1.5;
        roundMessage = "Player blackjack vs dealer blackjack: paid 3:2.";
        setStats((prev) => ({
          ...prev,
          handsPlayed: prev.handsPlayed + 1,
          blackjacks: prev.blackjacks + 1,
          wins: prev.wins + 1,
        }));
      } else if (playerBJ) {
        payout = betAmount + betAmount * 1.5;
        roundMessage = "Blackjack! Paid 3:2.";
        setStats((prev) => ({
          ...prev,
          handsPlayed: prev.handsPlayed + 1,
          blackjacks: prev.blackjacks + 1,
          wins: prev.wins + 1,
        }));
      } else {
        roundMessage = "Dealer blackjack.";
        setStats((prev) => ({
          ...prev,
          handsPlayed: prev.handsPlayed + 1,
          losses: prev.losses + 1,
        }));
      }

      setBankroll((prev) => prev + payout);
      setHands([
        {
          cards: playerCards,
          finished: true,
          bet: betAmount,
        },
      ]);
      setRoundActive(false);
      setBusterBet(0);
      setMessage(
        currentBusterBet > 0
          ? `${roundMessage} | Buster loses.`
          : roundMessage
      );
    } else {
      setMessage("");
    }
  }

  function moveNext(updatedHands: Hand[], currentDeck: Card[]) {
    const nextIndex = updatedHands.findIndex(
      (hand, index) => index > activeHandIndex && !hand.finished
    );

    if (nextIndex !== -1) {
      setActiveHandIndex(nextIndex);
      return;
    }

    const anyUnfinished = updatedHands.findIndex((hand) => !hand.finished);
    if (anyUnfinished !== -1) {
      setActiveHandIndex(anyUnfinished);
      return;
    }

    resolveDealer(updatedHands, currentDeck);
  }

  function resolveDealer(finalHands: Hand[], currentDeck: Card[]) {
    let workingDeck = [...currentDeck];
    let dealerHand = [...dealer];

    while (getHandValue(dealerHand) < 17) {
      const draw = drawFromDeck(workingDeck);
      dealerHand = [...dealerHand, draw.card];
      workingDeck = draw.nextDeck;
    }

    setDealer(dealerHand);
    setDeck(workingDeck);

    let payout = 0;
    const dealerVal = getHandValue(dealerHand);

    let roundWins = 0;
    let roundLosses = 0;
    let roundPushes = 0;
    let roundBusts = 0;
    let roundSurrenders = 0;

    const results = finalHands.map((hand, index) => {
      const playerVal = getHandValue(hand.cards);

      if (hand.surrendered) {
        payout += hand.bet / 2;
        roundSurrenders += 1;
        return `Hand ${index + 1}: Surrender`;
      }

      if (playerVal > 21) {
        roundLosses += 1;
        roundBusts += 1;
        return `Hand ${index + 1}: Bust`;
      }

      if (dealerVal > 21 || playerVal > dealerVal) {
        payout += hand.bet * 2;
        roundWins += 1;
        return `Hand ${index + 1}: Win`;
      }

      if (playerVal === dealerVal) {
        payout += hand.bet;
        roundPushes += 1;
        return `Hand ${index + 1}: Push`;
      }

      roundLosses += 1;
      return `Hand ${index + 1}: Lose`;
    });

    let busterMessage = "";
    let didBusterWin = false;

    if (busterBet > 0) {
      if (dealerVal > 21) {
        const multi = getBusterMultiplier(dealerHand.length);
        if (multi > 0) {
          payout += busterBet + busterBet * multi;
          didBusterWin = true;
          busterMessage = ` | Buster wins ${busterBet * multi} chips (${dealerHand.length} cards)`;
        } else {
          busterMessage = " | Buster loses";
        }
      } else {
        busterMessage = " | Buster loses";
      }
    }

    setBankroll((prev) => prev + payout);
    setRoundActive(false);
    setBusterBet(0);
    setMessage(results.join(" | ") + busterMessage);

    setStats((prev) => ({
      ...prev,
      handsPlayed: prev.handsPlayed + finalHands.length,
      wins: prev.wins + roundWins,
      losses: prev.losses + roundLosses,
      pushes: prev.pushes + roundPushes,
      busts: prev.busts + roundBusts,
      surrenders: prev.surrenders + roundSurrenders,
      busterWins: prev.busterWins + (didBusterWin ? 1 : 0),
    }));
  }

  function hit() {
    if (hands.length === 0) return;

    const hand = hands[activeHandIndex];
    if (hand.finished) return;

    const draw = drawFromDeck(deck);
    const newCards = [...hand.cards, draw.card];

    const updated = [...hands];
    updated[activeHandIndex] = {
      ...hand,
      cards: newCards,
      finished: getHandValue(newCards) > 21,
    };

    setHands(updated);
    setDeck(draw.nextDeck);

    if (updated[activeHandIndex].finished) {
      moveNext(updated, draw.nextDeck);
    }
  }

  function stand() {
    if (hands.length === 0) return;

    const updated = [...hands];
    updated[activeHandIndex] = {
      ...updated[activeHandIndex],
      finished: true,
    };

    setHands(updated);
    moveNext(updated, deck);
  }

  function doubleDown() {
    if (!canDouble()) return;

    const hand = hands[activeHandIndex];

    if (bankroll < hand.bet) {
      setMessage("Not enough chips to double.");
      return;
    }

    const draw = drawFromDeck(deck);

    const updated = [...hands];
    updated[activeHandIndex] = {
      ...hand,
      cards: [...hand.cards, draw.card],
      finished: true,
      doubled: true,
      bet: hand.bet * 2,
    };

    setBankroll((prev) => prev - hand.bet);
    setHands(updated);
    setDeck(draw.nextDeck);
    setStats((prev) => ({
      ...prev,
      doubles: prev.doubles + 1,
    }));

    moveNext(updated, draw.nextDeck);
  }

  function split() {
    if (hands.length === 0) return;

    const hand = hands[activeHandIndex];
    if (!canSplitHand(hand)) return;

    if (bankroll < hand.bet) {
      setMessage("Not enough chips to split.");
      return;
    }

    let workingDeck = [...deck];

    const d1 = drawFromDeck(workingDeck);
    workingDeck = d1.nextDeck;

    const d2 = drawFromDeck(workingDeck);
    workingDeck = d2.nextDeck;

    const c1 = hand.cards[0];
    const c2 = hand.cards[1];

    const newHands: Hand[] = [
      { cards: [c1, d1.card], finished: false, bet: hand.bet },
      { cards: [c2, d2.card], finished: false, bet: hand.bet },
    ];

    const updated = [...hands];
    updated.splice(activeHandIndex, 1, ...newHands);

    setBankroll((prev) => prev - hand.bet);
    setHands(updated);
    setDeck(workingDeck);
    setMessage("Hand split.");
    setStats((prev) => ({
      ...prev,
      splits: prev.splits + 1,
    }));
  }

  function surrender() {
    if (hands.length === 0) return;

    const updated = [...hands];
    updated[activeHandIndex] = {
      ...updated[activeHandIndex],
      finished: true,
      surrendered: true,
    };

    setHands(updated);
    moveNext(updated, deck);
  }

  const playing = hands.some((h) => !h.finished);

  return (
    <main className="min-h-screen bg-green-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-semibold"
          >
            ← Main Menu
          </Link>

          <h1 className="text-3xl font-bold text-center flex-1">Practice Table</h1>

          <div className="w-[110px]" />
        </div>

        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-green-200 text-sm mb-1">Bankroll</p>
            <p className="text-2xl font-bold">{bankroll}</p>
          </div>

          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-green-200 text-sm mb-1">Lifetime Net</p>
            <p
              className={`text-2xl font-bold ${
                lifetimeNet > 0
                  ? "text-green-300"
                  : lifetimeNet < 0
                  ? "text-red-300"
                  : "text-white"
              }`}
            >
              {lifetimeNet > 0 ? "+" : ""}
              {lifetimeNet}
            </p>
            <p className="text-sm text-green-100 mt-1">
              {lifetimeNet > 0
                ? "Lifetime Profit"
                : lifetimeNet < 0
                ? "Lifetime Loss"
                : "Even"}
            </p>
          </div>

          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-green-200 text-sm mb-1">Bet</p>
            <input
              type="number"
              value={betAmount}
              disabled={roundActive}
              onChange={(e) => setBetAmount(Number(e.target.value) || 0)}
              className="text-black w-full mt-2 p-2 rounded"
            />
          </div>

          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-green-200 text-sm mb-1">Buster</p>
            <button
              onClick={() => setBusterOn(!busterOn)}
              disabled={roundActive}
              className={`mt-2 px-3 py-2 rounded font-semibold ${
                busterOn ? "bg-purple-600" : "bg-gray-600"
              }`}
            >
              {busterOn ? "ON ($5)" : "OFF"}
            </button>
          </div>

          <div className="bg-black/20 p-4 rounded-xl flex flex-col justify-between">
            <p className="text-green-200 text-sm mb-1">Practice Data</p>
            <button
              onClick={resetPracticeData}
              className="mt-2 px-3 py-2 rounded font-semibold bg-red-700 hover:bg-red-600"
            >
              Reset Stats
            </button>
          </div>
        </div>

        <div className="bg-black/20 rounded-2xl p-4 mb-6">
          <h2 className="mb-3 text-xl font-semibold">Buster Payout</h2>
          <div className="grid grid-cols-5 text-center gap-2">
            <div className="bg-white/10 rounded p-2">3: 2x</div>
            <div className="bg-white/10 rounded p-2">4: 2x</div>
            <div className="bg-white/10 rounded p-2">5: 3x</div>
            <div className="bg-white/10 rounded p-2">6: 10x</div>
            <div className="bg-white/10 rounded p-2 text-yellow-300">7+: 50x</div>
          </div>
        </div>

        <div className="bg-black/20 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">
            Dealer{" "}
            {dealer.length > 0
              ? playing
                ? `(${dealer[0]?.value ?? 0} + ?)`
                : `(${getHandValue(dealer)})`
              : ""}
          </h2>

          <p className="text-lg">
            {dealer.length === 0
              ? "-"
              : playing
              ? `${dealer[0]?.label} 🂠`
              : dealer.map((c) => c.label).join(" ")}
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {hands.length === 0 ? (
            <div className="bg-black/20 rounded-2xl p-6 text-center text-green-100">
              No hand dealt yet.
            </div>
          ) : (
            hands.map((hand, i) => (
              <div
                key={i}
                className={`rounded-2xl p-6 ${
                  i === activeHandIndex && !hand.finished
                    ? "bg-yellow-500/20 border border-yellow-400"
                    : "bg-black/20"
                }`}
              >
                <h3 className="text-lg font-semibold mb-2">
                  Hand {i + 1} {i === activeHandIndex && !hand.finished ? "(Active)" : ""}
                </h3>
                <p className="text-lg">{hand.cards.map((c) => c.label).join(" ")}</p>
                <p className="text-green-100">Value: {getHandValue(hand.cards)}</p>
                <p className="text-green-100">Bet: {hand.bet}</p>
                {hand.doubled && <p className="text-orange-300 mt-1">Doubled</p>}
                {hand.surrendered && <p className="text-red-300 mt-1">Surrendered</p>}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 flex-wrap mt-6 mb-6">
          <button
            onClick={deal}
            disabled={roundActive || !statsLoaded}
            className="bg-green-600 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            Deal
          </button>

          <button
            onClick={hit}
            disabled={hands.length === 0 || hands[activeHandIndex]?.finished}
            className="bg-yellow-500 text-black disabled:bg-gray-600 disabled:text-white px-4 py-2 rounded"
          >
            Hit
          </button>

          <button
            onClick={stand}
            disabled={hands.length === 0 || hands[activeHandIndex]?.finished}
            className="bg-blue-600 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            Stand
          </button>

          <button
            onClick={doubleDown}
            disabled={!canDouble()}
            className="bg-orange-600 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            Double
          </button>

          <button
            onClick={split}
            disabled={!canSplit()}
            className="bg-purple-600 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            Split
          </button>

          <button
            onClick={surrender}
            disabled={hands.length === 0 || hands[activeHandIndex]?.finished}
            className="bg-red-600 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            Surrender
          </button>
        </div>

        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Hands</p>
            <p className="text-2xl font-bold">{stats.handsPlayed}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Wins</p>
            <p className="text-2xl font-bold">{stats.wins}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Losses</p>
            <p className="text-2xl font-bold">{stats.losses}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Pushes</p>
            <p className="text-2xl font-bold">{stats.pushes}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Blackjacks</p>
            <p className="text-2xl font-bold">{stats.blackjacks}</p>
          </div>

          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Busts</p>
            <p className="text-2xl font-bold">{stats.busts}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Splits</p>
            <p className="text-2xl font-bold">{stats.splits}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Doubles</p>
            <p className="text-2xl font-bold">{stats.doubles}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Surrenders</p>
            <p className="text-2xl font-bold">{stats.surrenders}</p>
          </div>
          <div className="bg-black/20 p-4 rounded-xl">
            <p className="text-sm text-green-200">Buster Wins</p>
            <p className="text-2xl font-bold">{stats.busterWins}</p>
          </div>
        </div>

        <p className="mt-4 text-lg">{message}</p>
      </div>
    </main>
  );
}