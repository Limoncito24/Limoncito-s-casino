"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

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

      if (existingPlayer) {
        setMessage("You are already in this lobby.");
        return;
      }

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

      setMessage(`Joined lobby: ${cleanCode}`);
    } catch (err) {
      console.error(err);
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
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

      <p className="text-center min-h-[24px]">{message}</p>
    </div>
  </main>
);