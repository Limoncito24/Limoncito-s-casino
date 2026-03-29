"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type LobbyPlayer = {
  id: string;
  username: string;
};

function generateLobbyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

export default function LobbyPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [currentLobbyId, setCurrentLobbyId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState("");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!currentLobbyId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("game_started")
        .eq("id", currentLobbyId)
        .single();

      if (data?.game_started) {
        window.location.href = "/game";
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentLobbyId]);

  async function loadPlayers(lobbyId: string) {
    const { data, error } = await supabase
      .from("lobby_players")
      .select("id, user_id")
      .eq("lobby_id", lobbyId)
      .order("joined_at", { ascending: true });

    if (error || !data) {
      setMessage("Failed to load players.");
      return;
    }

    const userIds = data.map((p) => p.user_id);

    if (userIds.length === 0) {
      setPlayers([]);
      return;
    }

    const { data: playerStats, error: statsError } = await supabase
      .from("player_stats")
      .select("user_id, username")
      .in("user_id", userIds);

    if (statsError || !playerStats) {
      setMessage("Failed to load player names.");
      return;
    }

    const formattedPlayers = data.map((p) => {
      const match = playerStats.find((s) => s.user_id === p.user_id);

      return {
        id: p.id,
        username: match?.username || "unknown player",
      };
    });

    setPlayers(formattedPlayers);
  }

  async function setHostStatus(hostUserId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsHost(false);
      return;
    }

    setIsHost(user.id === hostUserId);
  }

  async function handleCreateLobby() {
    if (loading) return;

    try {
      setLoading(true);
      setMessage("Creating lobby...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("You must be logged in.");
        return;
      }

      const code = generateLobbyCode();

      const { data: lobby, error: lobbyError } = await supabase
        .from("lobbies")
        .insert({
          code,
          host_user_id: user.id,
        })
        .select()
        .single();

      if (lobbyError || !lobby) {
        setMessage("Failed to create lobby.");
        return;
      }

      const { error: playerError } = await supabase
        .from("lobby_players")
        .insert({
          lobby_id: lobby.id,
          user_id: user.id,
        });

      if (playerError) {
        setMessage("Lobby created, but failed to add host.");
        return;
      }

      setCurrentLobbyId(lobby.id);
      setCurrentLobbyCode(code);
      setIsHost(true);
      await loadPlayers(lobby.id);
      setMessage(`Lobby created. Code: ${code}`);
    } catch (err) {
      console.error(err);
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinLobby() {
    if (loading) return;

    try {
      setLoading(true);
      setMessage("Joining lobby...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setMessage("You must be logged in.");
        return;
      }

      const cleanCode = joinCode.trim().toUpperCase();

      if (!cleanCode) {
        setMessage("Enter a lobby code.");
        return;
      }

      const { data: lobby, error: lobbyError } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", cleanCode)
        .single();

      if (lobbyError || !lobby) {
        setMessage("Lobby not found.");
        return;
      }

      const { data: existingPlayer } = await supabase
        .from("lobby_players")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingPlayer) {
        const { error: joinError } = await supabase
          .from("lobby_players")
          .insert({
            lobby_id: lobby.id,
            user_id: user.id,
          });

        if (joinError) {
          setMessage("Failed to join lobby.");
          return;
        }
      }

      setCurrentLobbyId(lobby.id);
      setCurrentLobbyCode(cleanCode);
      await setHostStatus(lobby.host_user_id);
      await loadPlayers(lobby.id);
      setMessage(`Joined lobby: ${cleanCode}`);
    } catch (err) {
      console.error(err);
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshPlayers() {
    if (!currentLobbyId) {
      setMessage("Join or create a lobby first.");
      return;
    }

    const { data: lobby, error } = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", currentLobbyId)
      .single();

    if (!error && lobby) {
      await setHostStatus(lobby.host_user_id);
    }

    setMessage("Refreshing players...");
    await loadPlayers(currentLobbyId);
    setMessage(`Lobby: ${currentLobbyCode}`);
  }

  async function handleStartGame() {
    if (!currentLobbyId) {
      setMessage("Create or join a lobby first.");
      return;
    }

    if (!isHost) {
      setMessage("Only the host can start the game.");
      return;
    }

    setMessage("Starting game...");

    const { error } = await supabase
      .from("lobbies")
      .update({ game_started: true })
      .eq("id", currentLobbyId);

    if (error) {
      setMessage("Failed to start game.");
      return;
    }

    window.location.href = "/game";
  }

  return (
    <main className="min-h-screen bg-green-950 text-white p-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-black/20 rounded-2xl p-6 space-y-4">
        <h1 className="text-3xl font-bold text-center">Private Lobby</h1>

        <a
          href="/signin"
          className="block w-full bg-yellow-500 text-black text-center py-3 rounded-lg font-semibold"
        >
          Go to Sign In
        </a>

        <button
          onClick={handleCreateLobby}
          disabled={loading}
          className="w-full bg-blue-600 py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          {loading ? "Working..." : "Create Lobby"}
        </button>

        <input
          placeholder="Enter lobby code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          className="w-full p-3 rounded-lg text-black bg-white"
        />

        <button
          onClick={handleJoinLobby}
          disabled={loading}
          className="w-full bg-green-600 py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          {loading ? "Working..." : "Join Lobby"}
        </button>

        <button
          onClick={handleRefreshPlayers}
          className="w-full bg-purple-600 py-3 rounded-lg font-semibold"
        >
          Refresh Players
        </button>

        {currentLobbyCode && (
          <div className="space-y-2">
            {isHost ? (
              <button
                onClick={handleStartGame}
                className="w-full bg-red-600 py-3 rounded-lg font-semibold"
              >
                Start Game
              </button>
            ) : (
              <p className="text-center text-yellow-300">
                Waiting for host to start game
              </p>
            )}
          </div>
        )}

        <p className="text-center min-h-[24px]">{message}</p>

        {currentLobbyCode && (
          <div className="bg-black/20 rounded-xl p-4 space-y-2">
            <h2 className="text-xl font-bold">Lobby Code: {currentLobbyCode}</h2>
            <h3 className="text-lg font-semibold">
              Players {isHost ? "(You are host)" : ""}
            </h3>

            {players.length === 0 ? (
              <p>No players found.</p>
            ) : (
              <div className="space-y-1">
                {players.map((player) => (
                  <p key={player.id}>- {player.username}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}