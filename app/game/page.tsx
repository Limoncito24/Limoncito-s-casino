"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

type HandResult =
  | "win"
  | "lose"
  | "push"
  | "bust"
  | "surrender"
  | "blackjack";

type Hand = {
  cards: string[];
  bet: number;
  busterBet: number;
  done: boolean;
  busted: boolean;
  surrendered: boolean;
  doubled: boolean;
  blackjack: boolean;
  result?: HandResult;
  busterWon?: boolean;
  busterPayout?: number;
};

type GameState = {
  deck: string[];
  playerHands: Record<string, Hand[]>;
  activeHandIndex: Record<string, number>;
  dealerHand: string[];
  roundStarted: boolean;
  roundFinished: boolean;
  dealerRevealed: boolean;
  betsLocked: boolean;
};

type PlayerStatRow = {
  username: string;
  bankroll: number | null;
  hands_played: number | null;
  hands_won: number | null;
  hands_lost: number | null;
  hands_pushed: number | null;
  pending_bet?: number | null;
  pending_buster_bet?: number | null;
};

const EMPTY_GAME_STATE: GameState = {
  deck: [],
  playerHands: {},
  activeHandIndex: {},
  dealerHand: [],
  roundStarted: false,
  roundFinished: false,
  dealerRevealed: false,
  betsLocked: false,
};

function normalizeGameState(value: unknown): GameState {
  const raw = (value as Partial<GameState>) || {};

  return {
    deck: Array.isArray(raw.deck) ? raw.deck : [],
    playerHands: raw.playerHands || {},
    activeHandIndex: raw.activeHandIndex || {},
    dealerHand: Array.isArray(raw.dealerHand) ? raw.dealerHand : [],
    roundStarted: raw.roundStarted || false,
    roundFinished: raw.roundFinished || false,
    dealerRevealed: raw.dealerRevealed || false,
    betsLocked: raw.betsLocked || false,
  };
}

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

function canSplitRanks(cardA: string, cardB: string) {
  const rankA = getCardRank(cardA);
  const rankB = getCardRank(cardB);
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

function getBusterMultiplier(cardCount: number) {
  if (cardCount >= 7) return 50;
  if (cardCount === 6) return 10;
  if (cardCount === 5) return 3;
  if (cardCount === 4) return 2;
  if (cardCount === 3) return 2;
  return 0;
}

function Card({ card, hidden = false }: { card: string; hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-xl bg-blue-700 border-2 border-white/30 flex items-center justify-center shadow-lg">
        <div className="w-8 h-12 sm:w-10 sm:h-16 rounded-lg border border-white/30 bg-blue-500/40" />
      </div>
    );
  }

  return (
    <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-xl bg-white border-2 border-gray-300 shadow-lg p-2 flex flex-col justify-between">
      <div className={`text-xs sm:text-sm font-bold ${getCardColor(card)}`}>{card}</div>
      <div className={`text-xl sm:text-2xl text-center ${getCardColor(card)}`}>{getCardSuit(card)}</div>
      <div className={`text-xs sm:text-sm font-bold rotate-180 self-end ${getCardColor(card)}`}>{card}</div>
    </div>
  );
}

export default function GamePage() {
  const router = useRouter();

  const [message, setMessage] = useState("Loading table...");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [turnIndex, setTurnIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>(EMPTY_GAME_STATE);
  const [bankrolls, setBankrolls] = useState<Record<string, number>>({});
  const [betInputs, setBetInputs] = useState<Record<string, number>>({});
  const [busterInputs, setBusterInputs] = useState<Record<string, number>>({});
  const [confirmedBets, setConfirmedBets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadGameShell();
  }, []);

  useEffect(() => {
    if (!currentLobbyId) return;

    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from("lobbies")
        .select("turn_index, game_started, game_state")
        .eq("id", currentLobbyId)
        .single();

      if (error || !data) return;

      setTurnIndex(data.turn_index ?? 0);
      setGameState(normalizeGameState(data.game_state));
      await refreshBankrolls();

      if (!data.game_started) {
        router.push("/lobby");
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [currentLobbyId, router, players]);

  async function loadGameShell() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setMessage("You must be logged in.");
      return;
    }

    const { data: joinedLobbies, error: joinedError } = await supabase
      .from("lobby_players")
      .select("lobby_id")
      .eq("user_id", user.id);

    if (joinedError || !joinedLobbies || joinedLobbies.length === 0) {
      setMessage("No active lobby found.");
      return;
    }

    const lobbyIds = joinedLobbies.map((row) => row.lobby_id);

    const { data: lobbies, error: lobbyError } = await supabase
      .from("lobbies")
      .select("*")
      .in("id", lobbyIds)
      .eq("game_started", true)
      .order("created_at", { ascending: false });

    if (lobbyError || !lobbies || lobbies.length === 0) {
      setMessage("No started game found.");
      return;
    }

    const lobby = lobbies[0];

    setCurrentLobbyId(lobby.id);
    setCurrentLobbyCode(lobby.code);
    setIsHost(lobby.host_user_id === user.id);
    setTurnIndex(lobby.turn_index ?? 0);
    setGameState(normalizeGameState(lobby.game_state));

    const { data: lobbyPlayers, error: playersError } = await supabase
      .from("lobby_players")
      .select("id, user_id")
      .eq("lobby_id", lobby.id)
      .order("joined_at", { ascending: true });

    if (playersError || !lobbyPlayers) {
      setMessage("Failed to load players.");
      return;
    }

    const userIds = lobbyPlayers.map((p) => p.user_id);

    const { data: stats, error: statsError } = await supabase
      .from("player_stats")
      .select("user_id, username, bankroll, pending_bet, pending_buster_bet")
      .in("user_id", userIds);

    if (statsError || !stats) {
      setMessage("Failed to load usernames.");
      return;
    }

    const formattedPlayers = lobbyPlayers.map((p) => {
      const match = stats.find((s) => s.user_id === p.user_id);
      return {
        id: p.id,
        username: match?.username || "unknown player",
      };
    });

    const me = stats.find((s) => s.user_id === user.id);
    const bankrollMap: Record<string, number> = {};
    const betMap: Record<string, number> = {};
    const busterMap: Record<string, number> = {};
    const confirmedMap: Record<string, boolean> = {};

    stats.forEach((s) => {
      const username = s.username || "unknown player";
      bankrollMap[username] = s.bankroll ?? 1000;
      betMap[username] = s.pending_bet ?? 100;
      busterMap[username] = s.pending_buster_bet ?? 0;
      confirmedMap[username] = false;
    });

    setCurrentUsername(me?.username || "unknown player");
    setPlayers(formattedPlayers);
    setBankrolls(bankrollMap);
    setBetInputs(betMap);
    setBusterInputs(busterMap);
    setConfirmedBets(confirmedMap);
    setMessage("Table loaded.");
  }

  function getCurrentHand(username: string) {
    const handIndex = gameState.activeHandIndex[username] ?? 0;
    const hands = gameState.playerHands[username] || [];
    return {
      handIndex,
      hand: hands[handIndex],
      hands,
    };
  }

  function areAllPlayersDone(state: GameState) {
    return players.every((player) => {
      const hands = state.playerHands[player.username] || [];
      return hands.length > 0 && hands.every((hand) => hand.done);
    });
  }

  function getNextUndoneHandIndex(hands: Hand[], currentIndex: number) {
    for (let i = currentIndex + 1; i < hands.length; i++) {
      if (!hands[i].done) return i;
    }
    return -1;
  }

  function getNextActiveTurnIndex(startIndex: number, state: GameState) {
    if (players.length === 0) return 0;

    for (let step = 1; step <= players.length; step++) {
      const nextIndex = (startIndex + step) % players.length;
      const username = players[nextIndex]?.username;
      const handIndex = state.activeHandIndex[username] ?? 0;
      const hands = state.playerHands[username] || [];
      const activeHand = hands[handIndex];

      if (activeHand && !activeHand.done) {
        return nextIndex;
      }
    }

    return startIndex;
  }

  function advanceAfterHandDone(
    username: string,
    finishedHandIndex: number,
    state: GameState,
    currentTurn: number
  ) {
    const hands = state.playerHands[username] || [];
    const nextHandIndex = getNextUndoneHandIndex(hands, finishedHandIndex);

    if (nextHandIndex !== -1) {
      state.activeHandIndex = {
        ...state.activeHandIndex,
        [username]: nextHandIndex,
      };
      return { nextTurnIndex: currentTurn, roundFinished: false };
    }

    if (areAllPlayersDone(state)) {
      state.roundFinished = true;
      return { nextTurnIndex: currentTurn, roundFinished: true };
    }

    return {
      nextTurnIndex: getNextActiveTurnIndex(currentTurn, state),
      roundFinished: false,
    };
  }

  async function handleConfirmBet(username: string) {
    const mainBet = betInputs[username] ?? 100;
    const busterBet = busterInputs[username] ?? 0;

    const { error } = await supabase
      .from("player_stats")
      .update({
        pending_bet: mainBet,
        pending_buster_bet: busterBet,
      })
      .eq("username", username);

    if (error) {
      setMessage("Failed to save bet.");
      return;
    }

    setConfirmedBets((prev) => ({
      ...prev,
      [username]: true,
    }));

    setMessage(`Bet saved: main $${mainBet} · buster $${busterBet}`);
  }

  async function updateLobbyGame(
    updates: Partial<{
      turn_index: number;
      game_state: GameState;
      game_started: boolean;
    }>
  ) {
    if (!currentLobbyId) {
      return { error: new Error("No lobby id") };
    }

    return await supabase.from("lobbies").update(updates).eq("id", currentLobbyId);
  }

  async function refreshBankrolls() {
    const usernames = players.map((p) => p.username);
    if (usernames.length === 0) return;

    const { data, error } = await supabase
      .from("player_stats")
      .select("username, bankroll")
      .in("username", usernames);

    if (error || !data) return;

    const next: Record<string, number> = {};
    data.forEach((row) => {
      next[row.username] = row.bankroll ?? 1000;
    });
    setBankrolls(next);
  }

  async function settleRound(
    stateToSettle: GameState,
    dealerHandOverride?: string[]
  ): Promise<{ updatedState: GameState; summaryMessage: string }> {
    const dealerHand = dealerHandOverride ? [...dealerHandOverride] : [...stateToSettle.dealerHand];
    const dealerTotal = calculateHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;
    const busterMultiplier = dealerBust ? getBusterMultiplier(dealerHand.length) : 0;

    const updatedState: GameState = {
      ...stateToSettle,
      dealerHand,
      dealerRevealed: true,
      roundFinished: true,
      betsLocked: false,
    };

    const statsPromises: Promise<void>[] = [];

    for (const player of players) {
      const username = player.username;
      const hands = updatedState.playerHands[username] || [];

      let bankrollChange = 0;
      let won = 0;
      let lost = 0;
      let pushed = 0;
      let played = 0;

      const resolvedHands = hands.map((hand) => {
        played += 1;

        const nextHand: Hand = {
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
          lost += 1;
          nextHand.result = "surrender";
          return nextHand;
        }

        if (hand.busted) {
          bankrollChange -= hand.bet;
          lost += 1;
          nextHand.result = "bust";
          return nextHand;
        }

        const handTotal = calculateHandTotal(hand.cards);

        if (hand.blackjack) {
          if (isBlackjack(dealerHand)) {
            pushed += 1;
            nextHand.result = "push";
            return nextHand;
          }

          bankrollChange += hand.bet * 1.5;
          won += 1;
          nextHand.result = "blackjack";
          return nextHand;
        }

        if (isBlackjack(dealerHand)) {
          bankrollChange -= hand.bet;
          lost += 1;
          nextHand.result = "lose";
          return nextHand;
        }

        if (dealerBust || handTotal > dealerTotal) {
          bankrollChange += hand.bet;
          won += 1;
          nextHand.result = "win";
          return nextHand;
        }

        if (handTotal < dealerTotal) {
          bankrollChange -= hand.bet;
          lost += 1;
          nextHand.result = "lose";
          return nextHand;
        }

        pushed += 1;
        nextHand.result = "push";
        return nextHand;
      });

      updatedState.playerHands[username] = resolvedHands;

      const { data: currentStats, error: statsError } = await supabase
        .from("player_stats")
        .select("hands_played, hands_won, hands_lost, hands_pushed, bankroll")
        .eq("username", username)
        .single<PlayerStatRow>();

      if (statsError || !currentStats) {
        continue;
      }

      statsPromises.push(
        (async () => {
          await supabase
            .from("player_stats")
            .update({
              bankroll:
                Math.round(((currentStats.bankroll ?? 1000) + bankrollChange) * 100) / 100,
              hands_played: (currentStats.hands_played ?? 0) + played,
              hands_won: (currentStats.hands_won ?? 0) + won,
              hands_lost: (currentStats.hands_lost ?? 0) + lost,
              hands_pushed: (currentStats.hands_pushed ?? 0) + pushed,
            })
            .eq("username", username);
        })()
      );
    }

    await Promise.all(statsPromises);

    const { error } = await updateLobbyGame({
      game_state: updatedState,
    });

    setConfirmedBets((prev) => {
      const next = { ...prev };
      players.forEach((player) => {
        next[player.username] = false;
      });
      return next;
    });

    if (error) {
      return {
        updatedState,
        summaryMessage: "Round settled, but failed to save lobby state.",
      };
    }

    await refreshBankrolls();

    if (isBlackjack(dealerHand)) {
      return {
        updatedState,
        summaryMessage: "Dealer has blackjack.",
      };
    }

    if (dealerBust) {
      return {
        updatedState,
        summaryMessage: `Dealer busted with ${dealerHand.length} cards. Buster paid ${busterMultiplier}:1`,
      };
    }

    return {
      updatedState,
      summaryMessage: "Dealer finished.",
    };
  }

  async function handleStartRound() {
    if (!isHost) {
      setMessage("Only host can start the round.");
      return;
    }

    if (players.length === 0) {
      setMessage("No players found.");
      return;
    }

    const usernames = players.map((p) => p.username);

    const { data: latestStats, error: latestStatsError } = await supabase
      .from("player_stats")
      .select("username, bankroll, pending_bet, pending_buster_bet")
      .in("username", usernames);

    if (latestStatsError || !latestStats) {
      setMessage("Failed to load latest bets.");
      return;
    }

    const deckCount = players.length + 1;
    const deck = createDecks(deckCount);
    const playerHands: Record<string, Hand[]> = {};
    const activeHandIndex: Record<string, number> = {};

    for (const player of players) {
      const latest = latestStats.find((s) => s.username === player.username);

      const bankroll = latest?.bankroll ?? bankrolls[player.username] ?? 1000;
      const requestedBuster = Number(latest?.pending_buster_bet ?? 0);
      const finalBusterBet = requestedBuster >= 5 ? 5 : 0;

      const maxMainBet = Math.max(1, bankroll - finalBusterBet);
      const requestedBet = Math.max(1, Number(latest?.pending_bet ?? 100));
      const finalBet = Math.min(requestedBet, maxMainBet);

      if (bankroll < finalBet + finalBusterBet) {
        setMessage(`${player.username} does not have enough bankroll.`);
        return;
      }

      const cards = [deck.pop()!, deck.pop()!];
      const blackjack = isBlackjack(cards);

      playerHands[player.username] = [
        {
          cards,
          bet: finalBet,
          busterBet: finalBusterBet,
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
      activeHandIndex[player.username] = 0;
    }

    const dealerHand = [deck.pop()!, deck.pop()!];
    const dealerHasBlackjack = isBlackjack(dealerHand);

    const freshState: GameState = {
      deck,
      playerHands,
      activeHandIndex,
      dealerHand,
      roundStarted: true,
      roundFinished:
        dealerHasBlackjack ||
        players.every((player) =>
          (playerHands[player.username] || []).every((hand) => hand.done)
        ),
      dealerRevealed: dealerHasBlackjack,
      betsLocked: true,
    };

    const { error } = await updateLobbyGame({
      game_state: freshState,
      turn_index: 0,
    });

    if (error) {
      setMessage("Failed to start round.");
      return;
    }

    setGameState(freshState);
    setTurnIndex(0);

    if (dealerHasBlackjack) {
      const { updatedState, summaryMessage } = await settleRound(freshState, dealerHand);
      setGameState(updatedState);
      setMessage(summaryMessage);
      return;
    }

    setMessage(`Round started. Shoe: ${deckCount} decks`);
  }

  async function handleHit() {
    if (!currentLobbyId || !gameState.roundStarted || gameState.roundFinished) return;

    const currentTurnPlayer = players[turnIndex]?.username;
    if (!currentTurnPlayer || currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const { handIndex, hand, hands } = getCurrentHand(currentTurnPlayer);
    if (!hand || hand.done) return;

    const deck = [...gameState.deck];
    const drawnCard = deck.pop();

    if (!drawnCard) {
      setMessage("Deck is empty.");
      return;
    }

    const updatedHand: Hand = {
      ...hand,
      blackjack: false,
      cards: [...hand.cards, drawnCard],
    };

    const handTotal = calculateHandTotal(updatedHand.cards);
    if (handTotal > 21) {
      updatedHand.busted = true;
      updatedHand.done = true;
      updatedHand.result = "bust";
    }

    const updatedHands = [...hands];
    updatedHands[handIndex] = updatedHand;

    const updatedState: GameState = {
      ...gameState,
      deck,
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHands,
      },
    };

    let nextIndex = turnIndex;

    if (updatedHand.done) {
      const advanced = advanceAfterHandDone(
        currentTurnPlayer,
        handIndex,
        updatedState,
        turnIndex
      );
      nextIndex = advanced.nextTurnIndex;
    }

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: nextIndex,
    });

    if (error) {
      setMessage("Failed to hit.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(nextIndex);
    setMessage(
      updatedHand.busted
        ? `${currentTurnPlayer} drew ${drawnCard} and busted`
        : `${currentTurnPlayer} drew ${drawnCard}`
    );
  }

  async function handleStand() {
    if (!currentLobbyId || !gameState.roundStarted || gameState.roundFinished) return;

    const currentTurnPlayer = players[turnIndex]?.username;
    if (!currentTurnPlayer || currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const { handIndex, hand, hands } = getCurrentHand(currentTurnPlayer);
    if (!hand || hand.done) return;

    const updatedHands = [...hands];
    updatedHands[handIndex] = {
      ...hand,
      done: true,
    };

    const updatedState: GameState = {
      ...gameState,
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHands,
      },
    };

    const advanced = advanceAfterHandDone(
      currentTurnPlayer,
      handIndex,
      updatedState,
      turnIndex
    );

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: advanced.nextTurnIndex,
    });

    if (error) {
      setMessage("Failed to stand.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(advanced.nextTurnIndex);
    setMessage(
      advanced.nextTurnIndex === turnIndex && !updatedState.roundFinished
        ? `${currentTurnPlayer} moved to next split hand.`
        : `${currentTurnPlayer} stood.`
    );
  }

  async function handleDoubleDown() {
    if (!currentLobbyId || !gameState.roundStarted || gameState.roundFinished) return;

    const currentTurnPlayer = players[turnIndex]?.username;
    if (!currentTurnPlayer || currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const { handIndex, hand, hands } = getCurrentHand(currentTurnPlayer);
    if (!hand || hand.done) return;

    const bankroll = bankrolls[currentTurnPlayer] ?? 1000;
    if (bankroll < hand.bet * 2 + hand.busterBet) {
      setMessage("Not enough bankroll to double down.");
      return;
    }

    const deck = [...gameState.deck];
    const drawnCard = deck.pop();
    if (!drawnCard) {
      setMessage("Deck is empty.");
      return;
    }

    const doubledHand: Hand = {
      ...hand,
      blackjack: false,
      bet: hand.bet * 2,
      doubled: true,
      done: true,
      cards: [...hand.cards, drawnCard],
    };

    const handTotal = calculateHandTotal(doubledHand.cards);
    if (handTotal > 21) {
      doubledHand.busted = true;
      doubledHand.result = "bust";
    }

    const updatedHands = [...hands];
    updatedHands[handIndex] = doubledHand;

    const updatedState: GameState = {
      ...gameState,
      deck,
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHands,
      },
    };

    const advanced = advanceAfterHandDone(
      currentTurnPlayer,
      handIndex,
      updatedState,
      turnIndex
    );

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: advanced.nextTurnIndex,
    });

    if (error) {
      setMessage("Failed to double down.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(advanced.nextTurnIndex);
    setMessage(`${currentTurnPlayer} doubled down and drew ${drawnCard}`);
  }

  async function handleSurrender() {
    if (!currentLobbyId || !gameState.roundStarted || gameState.roundFinished) return;

    const currentTurnPlayer = players[turnIndex]?.username;
    if (!currentTurnPlayer || currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const { handIndex, hand, hands } = getCurrentHand(currentTurnPlayer);
    if (!hand || hand.done) return;

    const surrenderedHand: Hand = {
      ...hand,
      surrendered: true,
      done: true,
      result: "surrender",
    };

    const updatedHands = [...hands];
    updatedHands[handIndex] = surrenderedHand;

    const updatedState: GameState = {
      ...gameState,
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHands,
      },
    };

    const advanced = advanceAfterHandDone(
      currentTurnPlayer,
      handIndex,
      updatedState,
      turnIndex
    );

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: advanced.nextTurnIndex,
    });

    if (error) {
      setMessage("Failed to surrender.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(advanced.nextTurnIndex);
    setMessage(`${currentTurnPlayer} surrendered.`);
  }

  async function handleSplit() {
    if (!currentLobbyId || !gameState.roundStarted || gameState.roundFinished) return;

    const currentTurnPlayer = players[turnIndex]?.username;
    if (!currentTurnPlayer || currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const { handIndex, hand, hands } = getCurrentHand(currentTurnPlayer);
    if (!hand || hand.done || hand.doubled || hand.cards.length !== 2) {
      setMessage("You can only split your first 2 cards.");
      return;
    }

    const [card1, card2] = hand.cards;
    if (!canSplitRanks(card1, card2)) {
      setMessage("Cards must match rank or both be 10-value cards to split.");
      return;
    }

    const bankroll = bankrolls[currentTurnPlayer] ?? 1000;
    if (bankroll < hand.bet * 2 + hand.busterBet) {
      setMessage("Not enough bankroll to split.");
      return;
    }

    const deck = [...gameState.deck];
    const newCard1 = deck.pop();
    const newCard2 = deck.pop();

    if (!newCard1 || !newCard2) {
      setMessage("Not enough cards left in shoe.");
      return;
    }

    const firstHand: Hand = {
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

    const secondHand: Hand = {
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

    const updatedHands = [...hands];
    updatedHands.splice(handIndex, 1, firstHand, secondHand);

    const updatedState: GameState = {
      ...gameState,
      deck,
      activeHandIndex: {
        ...gameState.activeHandIndex,
        [currentTurnPlayer]: handIndex,
      },
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHands,
      },
    };

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: turnIndex,
    });

    if (error) {
      setMessage("Failed to split.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(turnIndex);
    setMessage("Hand split. Play hand 1 first.");
  }

  async function handleDealerPlay() {
    if (!isHost) {
      setMessage("Only host can run dealer.");
      return;
    }

    if (!gameState.roundFinished) {
      setMessage("Players must finish first.");
      return;
    }

    const deck = [...gameState.deck];
    const dealerHand = [...gameState.dealerHand];

    while (calculateHandTotal(dealerHand) < 17 && deck.length > 0) {
      dealerHand.push(deck.pop()!);
    }

    const { updatedState, summaryMessage } = await settleRound(
      {
        ...gameState,
        deck,
        dealerHand,
        dealerRevealed: true,
      },
      dealerHand
    );

    setGameState(updatedState);
    setMessage(summaryMessage);
  }

  async function handleEndGame() {
    if (!isHost) {
      setMessage("Only host can end the game.");
      return;
    }

    const { error } = await updateLobbyGame({
      game_started: false,
      turn_index: 0,
      game_state: EMPTY_GAME_STATE,
    });

    if (error) {
      setMessage("Failed to end game.");
      return;
    }

    router.push("/lobby");
  }

  const currentTurnPlayer = players.length > 0 ? players[turnIndex]?.username : "none";
  const isMyTurn = currentUsername === currentTurnPlayer;

  const dealerVisibleCards =
    gameState.dealerRevealed || gameState.roundFinished
      ? gameState.dealerHand
      : gameState.dealerHand.map((card, index) => (index === 0 ? card : "HIDDEN"));

  const dealerVisibleTotal =
    gameState.dealerRevealed || gameState.roundFinished
      ? calculateHandTotal(gameState.dealerHand)
      : gameState.dealerHand.length > 0
        ? calculateHandTotal([gameState.dealerHand[0]])
        : 0;

  const canSplitActiveHand = (() => {
    if (!isMyTurn || !gameState.roundStarted || gameState.roundFinished) return false;
    const { hand } = getCurrentHand(currentUsername);
    if (!hand || hand.done || hand.doubled || hand.cards.length !== 2) return false;
    if (!canSplitRanks(hand.cards[0], hand.cards[1])) return false;
    const bankroll = bankrolls[currentUsername] ?? 1000;
    return bankroll >= hand.bet * 2 + hand.busterBet;
  })();

  const results = useMemo(() => {
    if (!gameState.dealerRevealed) return [];

    return players.flatMap((player) => {
      const hands = gameState.playerHands[player.username] || [];
      return hands.map((hand, index) => {
        const handTotal = calculateHandTotal(hand.cards);
        const busterText = hand.busterWon ? ` + buster $${hand.busterPayout}` : "";
        return `${player.username} hand ${index + 1}: ${hand.result || "done"} (${handTotal})${busterText}`;
      });
    });
  }, [players, gameState]);

  return (
    <main className="h-screen overflow-hidden bg-gradient-to-b from-green-950 via-green-900 to-green-950 text-white">
      <div className="h-full max-w-6xl mx-auto flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-36">
          <div className="rounded-3xl border border-yellow-400/20 bg-black/20 backdrop-blur p-5">
            <h1 className="text-3xl sm:text-4xl font-bold text-center text-yellow-300">
              Blackjack Table
            </h1>
            <p className="text-center mt-2">Lobby Code: {currentLobbyCode || "..."}</p>
            <p className="text-center text-white/80 mt-1">{message}</p>
          </div>

          <div className="rounded-[32px] border-4 border-yellow-700 bg-green-800 shadow-2xl p-4 sm:p-6 space-y-8">
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

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {players.map((player, index) => {
                const hands = gameState.playerHands[player.username] || [];
                const activeIndex = gameState.activeHandIndex[player.username] ?? 0;
                const isCurrentTurn =
                  index === turnIndex && gameState.roundStarted && !gameState.roundFinished;

                const canEditBets =
                  !gameState.betsLocked &&
                  player.username.trim().toLowerCase() === currentUsername.trim().toLowerCase();

                return (
                  <div
                    key={player.id}
                    className={`rounded-2xl p-4 border ${
                      isCurrentTurn
                        ? "border-yellow-400 bg-yellow-400/15"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-lg">{player.username}</p>
                        <p className="text-sm text-yellow-300">
                          Bankroll: ${bankrolls[player.username] ?? 1000}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        {isCurrentTurn ? (
                          <p className="text-green-300">Current turn</p>
                        ) : (
                          <p className="text-white/60">Waiting</p>
                        )}
                      </div>
                    </div>

                    {!gameState.betsLocked && (
                      <div className="mb-3 space-y-3">
                        <div>
                          <label className="text-sm text-white/70 block mb-2">Main Bet</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBetInputs((prev) => ({
                                  ...prev,
                                  [player.username]: Math.max(1, (prev[player.username] ?? 100) - 5),
                                }));
                                setConfirmedBets((prev) => ({
                                  ...prev,
                                  [player.username]: false,
                                }));
                              }}
                              disabled={!canEditBets}
                              className="px-4 py-3 rounded-lg bg-white/10 text-white disabled:opacity-50"
                            >
                              -5
                            </button>

                            <div className="w-full rounded-lg px-3 py-3 bg-white text-black text-lg text-center font-semibold">
                              ${betInputs[player.username] ?? 100}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setBetInputs((prev) => ({
                                  ...prev,
                                  [player.username]: (prev[player.username] ?? 100) + 5,
                                }));
                                setConfirmedBets((prev) => ({
                                  ...prev,
                                  [player.username]: false,
                                }));
                              }}
                              disabled={!canEditBets}
                              className="px-4 py-3 rounded-lg bg-white/10 text-white disabled:opacity-50"
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
                              onClick={() => {
                                setBusterInputs((prev) => ({
                                  ...prev,
                                  [player.username]: 0,
                                }));
                                setConfirmedBets((prev) => ({
                                  ...prev,
                                  [player.username]: false,
                                }));
                              }}
                              disabled={!canEditBets}
                              className={`py-3 rounded-lg font-semibold disabled:opacity-50 ${
                                (busterInputs[player.username] ?? 0) === 0
                                  ? "bg-gray-300 text-black"
                                  : "bg-white/10 text-white"
                              }`}
                            >
                              No Buster
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setBusterInputs((prev) => ({
                                  ...prev,
                                  [player.username]: 5,
                                }));
                                setConfirmedBets((prev) => ({
                                  ...prev,
                                  [player.username]: false,
                                }));
                              }}
                              disabled={!canEditBets}
                              className={`py-3 rounded-lg font-semibold disabled:opacity-50 ${
                                (busterInputs[player.username] ?? 0) === 5
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
                          onClick={() => handleConfirmBet(player.username)}
                          disabled={!canEditBets}
                          className={`w-full py-3 rounded-lg font-semibold disabled:opacity-50 ${
                            confirmedBets[player.username]
                              ? "bg-green-400 text-black"
                              : "bg-yellow-400 text-black"
                          }`}
                        >
                          {confirmedBets[player.username] ? "Bet Confirmed" : "Confirm Bet"}
                        </button>

                        <p className="text-xs text-white/80">
                          Selected: main ${betInputs[player.username] ?? 100} · buster $
                          {busterInputs[player.username] ?? 0}
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      {hands.length === 0 ? (
                        <p className="text-white/60">No cards yet</p>
                      ) : (
                        hands.map((hand, handIndex) => {
                          const handTotal = calculateHandTotal(hand.cards);
                          const isActiveHand =
                            handIndex === activeIndex && isCurrentTurn && !hand.done;

                          return (
                            <div
                              key={`${player.username}-hand-${handIndex}`}
                              className={`rounded-xl p-3 border ${
                                isActiveHand
                                  ? "border-yellow-400 bg-yellow-400/10"
                                  : "border-white/10 bg-white/5"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold">
                                  Hand {handIndex + 1} · Total {handTotal}
                                </p>
                                <div className="text-right text-sm text-white/70">
                                  <p>Main ${hand.bet}</p>
                                  <p>Buster ${hand.busterBet}</p>
                                </div>
                              </div>

                              <div className="flex gap-2 flex-wrap min-h-[90px] sm:min-h-[110px]">
                                {hand.cards.map((card, cardIndex) => (
                                  <Card
                                    key={`${player.username}-${handIndex}-${card}-${cardIndex}`}
                                    card={card}
                                  />
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
                                {hand.result && (
                                  <p className="text-yellow-300">Result: {hand.result}</p>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl bg-black/20 border border-white/10 p-5">
            <h2 className="text-2xl font-bold text-yellow-300 mb-3">Table Info</h2>
            <div className="space-y-2 text-white/90">
              <p>Current Turn: {currentTurnPlayer}</p>
              <p>You: {currentUsername || "..."}</p>
              <p>Host: {isHost ? "You" : "Another player"}</p>
              <p>Cards Left In Shoe: {gameState.deck.length}</p>
              <p>Decks In Shoe: {players.length + 1}</p>
              <p>Buster: optional $0 or $5</p>
              <p>Blackjack Pays: 3:2</p>
              <p>
                Round:{" "}
                {gameState.roundStarted
                  ? gameState.roundFinished
                    ? gameState.dealerRevealed
                      ? "Results ready"
                      : "Waiting for dealer"
                    : "Active"
                  : "Not started"}
              </p>
            </div>
          </div>

          {gameState.dealerRevealed && (
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

        <div className="border-t border-white/10 bg-black/40 backdrop-blur-md p-4">
          <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {isHost && (
              <button
                onClick={handleStartRound}
                className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-semibold"
              >
                Start
              </button>
            )}

            <button
              onClick={handleHit}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Hit
            </button>

            <button
              onClick={handleStand}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Stand
            </button>

            <button
              onClick={handleDoubleDown}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Double
            </button>

            <button
              onClick={handleSurrender}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-orange-600 hover:bg-orange-500 py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Surrender
            </button>

            <button
              onClick={handleSplit}
              disabled={!canSplitActiveHand}
              className="w-full bg-pink-600 hover:bg-pink-500 py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Split
            </button>

            {isHost && gameState.roundFinished && !gameState.dealerRevealed && (
              <button
                onClick={handleDealerPlay}
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-semibold"
              >
                Dealer
              </button>
            )}

            {isHost && (
              <button
                onClick={handleEndGame}
                className="w-full bg-red-600 hover:bg-red-500 py-3 rounded-xl font-semibold"
              >
                End Game
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}