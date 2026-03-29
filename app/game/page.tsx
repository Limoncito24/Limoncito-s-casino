"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

type GameState = {
  deck: string[];
  playerHands: Record<string, string[]>;
  playerDone: Record<string, boolean>;
  dealerHand: string[];
  roundStarted: boolean;
  roundFinished: boolean;
  dealerRevealed: boolean;
};

const EMPTY_GAME_STATE: GameState = {
  deck: [],
  playerHands: {},
  playerDone: {},
  dealerHand: [],
  roundStarted: false,
  roundFinished: false,
  dealerRevealed: false,
};

function normalizeGameState(value: unknown): GameState {
  const raw = (value as Partial<GameState>) || {};

  return {
    deck: Array.isArray(raw.deck) ? raw.deck : [],
    playerHands: raw.playerHands || {},
    playerDone: raw.playerDone || {},
    dealerHand: Array.isArray(raw.dealerHand) ? raw.dealerHand : [],
    roundStarted: raw.roundStarted || false,
    roundFinished: raw.roundFinished || false,
    dealerRevealed: raw.dealerRevealed || false,
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
      .select("user_id, username")
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

    setCurrentUsername(me?.username || "unknown player");
    setPlayers(formattedPlayers);
    setMessage("Table loaded.");
  }

  function areAllPlayersDone(allPlayers: LobbyPlayer[], state: GameState) {
    return allPlayers.every((player) => state.playerDone[player.username]);
  }

  function getNextActiveTurnIndex(
    startIndex: number,
    allPlayers: LobbyPlayer[],
    state: GameState
  ) {
    if (allPlayers.length === 0) return 0;

    for (let step = 1; step <= allPlayers.length; step++) {
      const nextIndex = (startIndex + step) % allPlayers.length;
      const username = allPlayers[nextIndex]?.username;

      if (!state.playerDone[username]) {
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
    const playerHands: Record<string, string[]> = {};
    const playerDone: Record<string, boolean> = {};

    for (const player of players) {
      playerHands[player.username] = [deck.pop()!, deck.pop()!];
      playerDone[player.username] = false;
    }

    const dealerHand = [deck.pop()!, deck.pop()!];

    const freshState: GameState = {
      deck,
      playerHands,
      playerDone,
      dealerHand,
      roundStarted: true,
      roundFinished: false,
      dealerRevealed: false,
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

    const deck = [...gameState.deck];
    const drawnCard = deck.pop();

    if (!drawnCard) {
      setMessage("Deck is empty.");
      return;
    }

    const currentHand = gameState.playerHands[currentTurnPlayer] || [];
    const updatedHand = [...currentHand, drawnCard];
    const total = calculateHandTotal(updatedHand);
    const busted = total > 21;

    const updatedState: GameState = {
      ...gameState,
      deck,
      playerHands: {
        ...gameState.playerHands,
        [currentTurnPlayer]: updatedHand,
      },
      playerDone: {
        ...gameState.playerDone,
        [currentTurnPlayer]: busted ? true : gameState.playerDone[currentTurnPlayer],
      },
    };

    let nextIndex = turnIndex;

    if (busted) {
      if (areAllPlayersDone(players, updatedState)) {
        updatedState.roundFinished = true;
      } else {
        nextIndex = getNextActiveTurnIndex(turnIndex, players, updatedState);
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
      busted
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

    const updatedState: GameState = {
      ...gameState,
      playerDone: {
        ...gameState.playerDone,
        [currentTurnPlayer]: true,
      },
    };

    let nextIndex = turnIndex;

    if (areAllPlayersDone(players, updatedState)) {
      updatedState.roundFinished = true;
    } else {
      nextIndex = getNextActiveTurnIndex(turnIndex, players, updatedState);
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

    const updatedState: GameState = {
      ...gameState,
      deck,
      dealerHand,
      dealerRevealed: true,
    };

    const { error } = await updateLobbyGame({
      game_state: updatedState,
    });

    if (error) {
      setMessage("Failed to run dealer.");
      return;
    }

    setGameState(updatedState);
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

    const dealerTotal = calculateHandTotal(gameState.dealerHand);
    const dealerBust = dealerTotal > 21;

    return players.map((player) => {
      const hand = gameState.playerHands[player.username] || [];
      const total = calculateHandTotal(hand);
      const busted = total > 21;

      if (busted) return `${player.username}: bust`;
      if (dealerBust) return `${player.username}: win`;
      if (total > dealerTotal) return `${player.username}: win`;
      if (total < dealerTotal) return `${player.username}: lose`;
      return `${player.username}: push`;
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
              const hand = gameState.playerHands[player.username] || [];
              const total = calculateHandTotal(hand);
              const isCurrentTurn = index === turnIndex && gameState.roundStarted && !gameState.roundFinished;
              const isDone = gameState.playerDone[player.username];
              const busted = total > 21;

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
                      <p className="text-sm text-white/70">Total: {hand.length ? total : 0}</p>
                    </div>
                    <div className="text-right text-sm">
                      {busted ? (
                        <p className="text-red-300">Busted</p>
                      ) : isDone ? (
                        <p className="text-yellow-300">Standing</p>
                      ) : isCurrentTurn ? (
                        <p className="text-green-300">Current turn</p>
                      ) : (
                        <p className="text-white/60">Waiting</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap min-h-[110px]">
                    {hand.length === 0 ? (
                      <p className="text-white/60">No cards yet</p>
                    ) : (
                      hand.map((card, handIndex) => (
                        <Card key={`${player.username}-${card}-${handIndex}`} card={card} />
                      ))
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

            {isHost && gameState.roundFinished && !gameState.dealerRevealed && (
              <button
                onClick={handleDealerPlay}
                className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold"
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