"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

export default function GamePage() {
  const [message, setMessage] = useState("Loading game...");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [turnIndex, setTurnIndex] = useState(0);

  useEffect(() => {
    loadGameShell();
  }, []);

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

    setPlayers(formattedPlayers);
    setMessage("Game shell loaded.");
  }

  function nextTurn() {
    if (players.length === 0) return;
    setTurnIndex((prev) => (prev + 1) % players.length);
  }

  async function handleEndGame() {
    if (!currentLobbyId) {
      setMessage("No lobby found.");
      return;
    }

    if (!isHost) {
      setMessage("Only host can end the game.");
      return;
    }

    const { error } = await supabase
      .from("lobbies")
      .update({ game_started: false })
      .eq("id", currentLobbyId);

    if (error) {
      setMessage("Failed to end game.");
      return;
    }

    window.location.href = "/lobby";
  }

  const currentTurnPlayer =
    players.length > 0 ? players[turnIndex]?.username : "none";

  return (
    <main className="min-h-screen bg-green-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-black/20 rounded-2xl p-6 space-y-3">
          <h1 className="text-4xl font-bold text-center">Multiplayer Game</h1>
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
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg ${
                      index === turnIndex ? "bg-yellow-500 text-black" : "bg-white/10"
                    }`}
                  >
                    {player.username}
                    {index === turnIndex ? " ← current turn" : ""}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-black/20 rounded-2xl p-6 space-y-4">
            <h2 className="text-2xl font-bold">Game Panel</h2>

            <p>Current Turn: {currentTurnPlayer}</p>
            <p>Host: {isHost ? "You" : "Another player"}</p>

            <button
              onClick={nextTurn}
              className="w-full bg-blue-600 py-3 rounded-lg font-semibold"
            >
              Next Turn
            </button>

            {isHost ? (
              <button
                onClick={handleEndGame}
                className="w-full bg-red-600 py-3 rounded-lg font-semibold"
              >
                End Game
              </button>
            ) : (
              <p className="text-yellow-300 text-center">
                Waiting for host controls
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}