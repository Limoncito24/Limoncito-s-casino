"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

type Hand = {
  cards: string[];
  bet: number;
  done: boolean;
  busted: boolean;
  surrendered: boolean;
  doubled: boolean;
  result?: "win" | "lose" | "push" | "bust" | "surrender";
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

function Card({
  card,
  hidden = false,
}: {
  card: string;
  hidden?: boolean;
}) {
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

      if (!data.game_started) {
        router.push("/lobby");
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [currentLobbyId, router]);

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
      .select("user_id, username, bankroll")
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

    stats.forEach((s) => {
      bankrollMap[s.username || "unknown player"] = s.bankroll ?? 1000;
      betMap[s.username || "unknown player"] = 100;
    });

    setCurrentUsername(me?.username || "unknown player");
    setPlayers(formattedPlayers);
    setBankrolls(bankrollMap);
    setBetInputs(betMap);
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

  async function handleStartRound() {
    if (!isHost) {
      setMessage("Only host can start the round.");
      return;
    }

    if (players.length === 0) {
      setMessage("No players found.");
      return;
    }

    const deck = createDeck();
    const playerHands: Record<string, Hand[]> = {};
    const activeHandIndex: Record<string, number> = {};

    for (const player of players) {
      const bet = Math.max(1, Number(betInputs[player.username] || 100));
      const bankroll = bankrolls[player.username] ?? 1000;
      const finalBet = Math.min(bet, bankroll);

      playerHands[player.username] = [
        {
          cards: [deck.pop()!, deck.pop()!],
          bet: finalBet,
          done: false,
          busted: false,
          surrendered: false,
          doubled: false,
        },
      ];
      activeHandIndex[player.username] = 0;
    }

    const dealerHand = [deck.pop()!, deck.pop()!];

    const freshState: GameState = {
      deck,
      playerHands,
      activeHandIndex,
      dealerHand,
      roundStarted: true,
      roundFinished: false,
      dealerRevealed: false,
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
    setMessage("Round started.");
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
      cards: [...hand.cards, drawnCard],
    };

    const total = calculateHandTotal(updatedHand.cards);
    if (total > 21) {
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
      if (areAllPlayersDone(updatedState)) {
        updatedState.roundFinished = true;
      } else {
        nextIndex = getNextActiveTurnIndex(turnIndex, updatedState);
      }
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

    let nextIndex = turnIndex;
    if (areAllPlayersDone(updatedState)) {
      updatedState.roundFinished = true;
    } else {
      nextIndex = getNextActiveTurnIndex(turnIndex, updatedState);
    }

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: nextIndex,
    });

    if (error) {
      setMessage("Failed to stand.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(nextIndex);
    setMessage(`${currentTurnPlayer} stood.`);
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
    if (hand.bet > bankroll) {
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
      bet: hand.bet * 2,
      doubled: true,
      done: true,
      cards: [...hand.cards, drawnCard],
    };

    const total = calculateHandTotal(doubledHand.cards);
    if (total > 21) {
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

    let nextIndex = turnIndex;
    if (areAllPlayersDone(updatedState)) {
      updatedState.roundFinished = true;
    } else {
      nextIndex = getNextActiveTurnIndex(turnIndex, updatedState);
    }

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: nextIndex,
    });

    if (error) {
      setMessage("Failed to double down.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(nextIndex);
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

    let nextIndex = turnIndex;
    if (areAllPlayersDone(updatedState)) {
      updatedState.roundFinished = true;
    } else {
      nextIndex = getNextActiveTurnIndex(turnIndex, updatedState);
    }

    const { error } = await updateLobbyGame({
      game_state: updatedState,
      turn_index: nextIndex,
    });

    if (error) {
      setMessage("Failed to surrender.");
      return;
    }

    setGameState(updatedState);
    setTurnIndex(nextIndex);
    setMessage(`${currentTurnPlayer} surrendered.`);
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

    const dealerTotal = calculateHandTotal(dealerHand);
    const dealerBust = dealerTotal > 21;

    const updatedState: GameState = {
      ...gameState,
      deck,
      dealerHand,
      dealerRevealed: true,
    };

    const bankrollUpdates: Promise<unknown>[] = [];

    for (const player of players) {
      const username = player.username;
      const hands = updatedState.playerHands[username] || [];
      const bankroll = bankrolls[username] ?? 1000;

      let bankrollChange = 0;
      let won = 0;
      let lost = 0;
      let pushed = 0;
      let played = 0;

      const resolvedHands = hands.map((hand) => {
        played += 1;

        if (hand.surrendered) {
          bankrollChange -= Math.floor(hand.bet / 2);
          lost += 1;
          return { ...hand, result: "surrender" as const };
        }

        if (hand.busted) {
          bankrollChange -= hand.bet;
          lost += 1;
          return { ...hand, result: "bust" as const };
        }

        const total = calculateHandTotal(hand.cards);

        if (dealerBust || total > dealerTotal) {
          bankrollChange += hand.bet;
          won += 1;
          return { ...hand, result: "win" as const };
        }

        if (total < dealerTotal) {
          bankrollChange -= hand.bet;
          lost += 1;
          return { ...hand, result: "lose" as const };
        }

        pushed += 1;
        return { ...hand, result: "push" as const };
      });

      updatedState.playerHands[username] = resolvedHands;

      bankrollUpdates.push(
        supabase
          .from("player_stats")
          .update({
            bankroll: bankroll + bankrollChange,
            hands_played: played,
          })
          .eq("username", username)
      );

      const { data: currentStats } = await supabase
        .from("player_stats")
        .select("hands_played, hands_won, hands_lost, hands_pushed, bankroll")
        .eq("username", username)
        .single();

      if (currentStats) {
        bankrollUpdates.push(
          supabase
            .from("player_stats")
            .update({
              bankroll: (currentStats.bankroll ?? bankroll) + bankrollChange,
              hands_played: (currentStats.hands_played ?? 0) + played,
              hands_won: (currentStats.hands_won ?? 0) + won,
              hands_lost: (currentStats.hands_lost ?? 0) + lost,
              hands_pushed: (currentStats.hands_pushed ?? 0) + pushed,
            })
            .eq("username", username)
        );
      }
    }

    await Promise.all(bankrollUpdates);

    const { error } = await updateLobbyGame({
      game_state: updatedState,
    });

    if (error) {
      setMessage("Failed to run dealer.");
      return;
    }

    setGameState(updatedState);
    await refreshBankrolls();
    setMessage("Dealer finished.");
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

  const results = useMemo(() => {
    if (!gameState.dealerRevealed) return [];

    return players.flatMap((player) => {
      const hands = gameState.playerHands[player.username] || [];
      return hands.map((hand, index) => {
        const total = calculateHandTotal(hand.cards);
        return `${player.username} hand ${index + 1}: ${hand.result || "done"} (${total})`;
      });
    });
  }, [players, gameState]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-950 via-green-900 to-green-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-3xl border border-yellow-400/20 bg-black/20 backdrop-blur p-5">
          <h1 className="text-4xl font-bold text-center text-yellow-300">Blackjack Table</h1>
          <p className="text-center mt-2">Lobby Code: {currentLobbyCode || "..."}</p>
          <p className="text-center text-white/80 mt-1">{message}</p>
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

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {players.map((player, index) => {
              const hands = gameState.playerHands[player.username] || [];
              const activeIndex = gameState.activeHandIndex[player.username] ?? 0;
              const isCurrentTurn = index === turnIndex && gameState.roundStarted && !gameState.roundFinished;

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
                    <div className="mb-3">
                      <label className="text-sm text-white/70 block mb-1">Bet</label>
                      <input
                        type="number"
                        min={1}
                        value={betInputs[player.username] ?? 100}
                        onChange={(e) =>
                          setBetInputs((prev) => ({
                            ...prev,
                            [player.username]: Number(e.target.value || 1),
                          }))
                        }
                        disabled={player.username !== currentUsername}
                        className="w-full rounded-lg px-3 py-2 text-black"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    {hands.length === 0 ? (
                      <p className="text-white/60">No cards yet</p>
                    ) : (
                      hands.map((hand, handIndex) => {
                        const total = calculateHandTotal(hand.cards);
                        const isActiveHand = handIndex === activeIndex && isCurrentTurn && !hand.done;

                        return (
                          <div
                            key={`${player.username}-hand-${handIndex}`}
                            className={`rounded-xl p-3 border ${
                              isActiveHand ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold">
                                Hand {handIndex + 1} · Total {total}
                              </p>
                              <p className="text-sm text-white/70">
                                Bet ${hand.bet}
                              </p>
                            </div>

                            <div className="flex gap-2 flex-wrap min-h-[110px]">
                              {hand.cards.map((card, cardIndex) => (
                                <Card key={`${player.username}-${handIndex}-${card}-${cardIndex}`} card={card} />
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
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="rounded-3xl bg-black/20 border border-white/10 p-5">
            <h2 className="text-2xl font-bold text-yellow-300 mb-3">Table Info</h2>
            <div className="space-y-2 text-white/90">
              <p>Current Turn: {currentTurnPlayer}</p>
              <p>You: {currentUsername || "..."}</p>
              <p>Host: {isHost ? "You" : "Another player"}</p>
              <p>Cards Left In Deck: {gameState.deck.length}</p>
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

          <div className="rounded-3xl bg-black/20 border border-white/10 p-5 space-y-3">
            <h2 className="text-2xl font-bold text-yellow-300">Actions</h2>

            {isHost && (
              <button
                onClick={handleStartRound}
                className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-semibold"
              >
                Start Round
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
              Double Down
            </button>

            <button
              onClick={handleSurrender}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-orange-600 hover:bg-orange-500 py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              Surrender
            </button>

            {isHost && gameState.roundFinished && !gameState.dealerRevealed && (
              <button
                onClick={handleDealerPlay}
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-semibold"
              >
                Run Dealer
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

            {!isMyTurn && gameState.roundStarted && !gameState.roundFinished && (
              <p className="text-sm text-yellow-300 text-center">Waiting for current player...</p>
            )}
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
    </main>
  );
}