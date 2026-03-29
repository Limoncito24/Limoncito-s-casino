"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

type PlayerState = {
  total: number;
  stood: boolean;
  busted: boolean;
};

type GameState = {
  players: Record<string, PlayerState>;
  dealerTotal: number;
  roundStarted: boolean;
  roundFinished: boolean;
};

const EMPTY_GAME_STATE: GameState = {
  players: {},
  dealerTotal: 0,
  roundStarted: false,
  roundFinished: false,
};

function normalizeGameState(value: unknown): GameState {
  const raw = (value as Partial<GameState>) || {};

  return {
    players: raw.players || {},
    dealerTotal: raw.dealerTotal || 0,
    roundStarted: raw.roundStarted || false,
    roundFinished: raw.roundFinished || false,
  };
}

export default function GamePage() {
  const router = useRouter();

  const [message, setMessage] = useState("Loading game...");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [turnIndex, setTurnIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>(EMPTY_GAME_STATE);

  useEffect(() => {
    loadGameShell();
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
    setMessage("Game loaded.");
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
      const playerState = state.players[username];

      if (!playerState?.stood && !playerState?.busted) {
        return nextIndex;
      }
    }

    return startIndex;
  }

  function areAllPlayersDone(allPlayers: LobbyPlayer[], state: GameState) {
    return allPlayers.every((player) => {
      const p = state.players[player.username];
      return p?.stood || p?.busted;
    });
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

    const freshState: GameState = {
      players: Object.fromEntries(
        players.map((player) => [
          player.username,
          {
            total: Math.floor(Math.random() * 10) + 2,
            stood: false,
            busted: false,
          },
        ])
      ),
      dealerTotal: Math.floor(Math.random() * 10) + 2,
      roundStarted: true,
      roundFinished: false,
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
    if (!currentLobbyId || players.length === 0 || !gameState.roundStarted || gameState.roundFinished) {
      return;
    }

    const currentTurnPlayer = players[turnIndex]?.username;

    if (currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const existing = gameState.players[currentTurnPlayer] || {
      total: 0,
      stood: false,
      busted: false,
    };

    const draw = Math.floor(Math.random() * 10) + 1;
    const newTotal = existing.total + draw;
    const busted = newTotal > 21;

    const updatedState: GameState = {
      ...gameState,
      players: {
        ...gameState.players,
        [currentTurnPlayer]: {
          ...existing,
          total: newTotal,
          busted,
        },
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
        ? `${currentTurnPlayer} drew ${draw} and busted`
        : `${currentTurnPlayer} drew ${draw}`
    );
  }

  async function handleStand() {
    if (!currentLobbyId || players.length === 0 || !gameState.roundStarted || gameState.roundFinished) {
      return;
    }

    const currentTurnPlayer = players[turnIndex]?.username;

    if (currentUsername !== currentTurnPlayer) {
      setMessage("Not your turn.");
      return;
    }

    const existing = gameState.players[currentTurnPlayer] || {
      total: 0,
      stood: false,
      busted: false,
    };

    const updatedState: GameState = {
      ...gameState,
      players: {
        ...gameState.players,
        [currentTurnPlayer]: {
          ...existing,
          stood: true,
        },
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

    let dealerTotal = gameState.dealerTotal;

    while (dealerTotal < 17) {
      dealerTotal += Math.floor(Math.random() * 10) + 1;
    }

    const updatedState: GameState = {
      ...gameState,
      dealerTotal,
    };

    const { error } = await updateLobbyGame({
      game_state: updatedState,
    });

    if (error) {
      setMessage("Failed to play dealer.");
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
  const dealerBust = gameState.dealerTotal > 21;

  const results = useMemo(() => {
    if (!gameState.roundFinished) return [];

    return players.map((player) => {
      const p = gameState.players[player.username];
      if (!p) return `${player.username}: no hand`;
      if (p.busted) return `${player.username}: bust`;
      if (dealerBust) return `${player.username}: win`;
      if (p.total > gameState.dealerTotal) return `${player.username}: win`;
      if (p.total < gameState.dealerTotal) return `${player.username}: lose`;
      return `${player.username}: push`;
    });
  }, [players, gameState, dealerBust]);

  return (
    <main className="min-h-screen bg-green-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-black/20 rounded-2xl p-6 space-y-3">
          <h1 className="text-4xl font-bold text-center">Multiplayer Blackjack</h1>
          <p className="text-center">Lobby Code: {currentLobbyCode || "..."}</p>
          <p className="text-center">{message}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-black/20 rounded-2xl p-6 space-y-3">
            <h2 className="text-2xl font-bold">Players</h2>

            {players.length === 0 ? (
              <p>No players loaded.</p>
            ) : (
              <div className="space-y-2">
                {players.map((player, index) => {
                  const p = gameState.players[player.username];
                  const total = p?.total ?? 0;
                  const stood = p?.stood;
                  const busted = p?.busted;

                  return (
                    <div
                      key={player.id}
                      className={`p-3 rounded-lg ${
                        index === turnIndex ? "bg-yellow-500 text-black" : "bg-white/10"
                      }`}
                    >
                      <div>{player.username} ({total})</div>
                      <div className="text-sm opacity-80">
                        {busted ? "busted" : stood ? "stood" : "playing"}
                        {index === turnIndex && !gameState.roundFinished ? " ← current turn" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-black/20 rounded-2xl p-6 space-y-4">
            <h2 className="text-2xl font-bold">Table</h2>

            <p>Current Turn: {currentTurnPlayer}</p>
            <p>Your Name: {currentUsername || "..."}</p>
            <p>Dealer Total: {gameState.dealerTotal}</p>
            <p>Host: {isHost ? "You" : "Another player"}</p>
            <p>
              Round:{" "}
              {gameState.roundStarted
                ? gameState.roundFinished
                  ? "Finished"
                  : "Active"
                : "Not started"}
            </p>

            {isHost && (
              <button
                onClick={handleStartRound}
                className="w-full bg-purple-600 py-3 rounded-lg font-semibold"
              >
                Start Round
              </button>
            )}

            <button
              onClick={handleHit}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-green-600 py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              Hit
            </button>

            <button
              onClick={handleStand}
              disabled={!isMyTurn || !gameState.roundStarted || gameState.roundFinished}
              className="w-full bg-yellow-500 text-black py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              Stand
            </button>

            {isHost && gameState.roundFinished && (
              <button
                onClick={handleDealerPlay}
                className="w-full bg-blue-600 py-3 rounded-lg font-semibold"
              >
                Run Dealer
              </button>
            )}

            {isHost && (
              <button
                onClick={handleEndGame}
                className="w-full bg-red-600 py-3 rounded-lg font-semibold"
              >
                End Game
              </button>
            )}

            {!isMyTurn && gameState.roundStarted && !gameState.roundFinished && (
              <p className="text-center text-yellow-300">Waiting for current player...</p>
            )}
          </div>
        </div>

        {gameState.roundFinished && (
          <div className="bg-black/20 rounded-2xl p-6 space-y-2">
            <h2 className="text-2xl font-bold">Results</h2>
            {results.length === 0 ? (
              <p>No results yet.</p>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <p key={result}>{result}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}