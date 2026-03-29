"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type PlayerStat = {
  id: string;
  username: string;
  bankroll: number;
  hands_played: number;
  hands_won: number;
  hands_lost: number;
  hands_pushed: number;
};

export default function AdminPage() {
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [message, setMessage] = useState("Loading admin panel...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlayers();
  }, []);

  async function loadPlayers() {
    setLoading(true);
    setMessage("Loading player stats...");

    const { data, error } = await supabase
      .from("player_stats")
      .select(
        "id, username, bankroll, hands_played, hands_won, hands_lost, hands_pushed"
      )
      .order("username", { ascending: true });

    if (error || !data) {
      setMessage("Failed to load player stats.");
      setLoading(false);
      return;
    }

    setPlayers(data);
    setMessage("Admin panel loaded.");
    setLoading(false);
  }

  async function updateBankroll(playerId: string, newBankroll: number) {
    const { error } = await supabase
      .from("player_stats")
      .update({ bankroll: newBankroll })
      .eq("id", playerId);

    if (error) {
      setMessage("Failed to update bankroll.");
      return;
    }

    setPlayers((prev) =>
      prev.map((player) =>
        player.id === playerId
          ? { ...player, bankroll: newBankroll }
          : player
      )
    );

    setMessage("Bankroll updated.");
  }

  async function addBankroll(playerId: string, currentBankroll: number, amount: number) {
    await updateBankroll(playerId, currentBankroll + amount);
  }

  async function resetStats(playerId: string) {
    const { error } = await supabase
      .from("player_stats")
      .update({
        bankroll: 1000,
        hands_played: 0,
        hands_won: 0,
        hands_lost: 0,
        hands_pushed: 0,
      })
      .eq("id", playerId);

    if (error) {
      setMessage("Failed to reset stats.");
      return;
    }

    setPlayers((prev) =>
      prev.map((player) =>
        player.id === playerId
          ? {
              ...player,
              bankroll: 1000,
              hands_played: 0,
              hands_won: 0,
              hands_lost: 0,
              hands_pushed: 0,
            }
          : player
      )
    );

    setMessage("Player stats reset.");
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">Admin Panel</h1>
              <p className="text-white/70 mt-2">{message}</p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Link
                href="/"
                className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded-xl font-semibold"
              >
                Home
              </Link>
              <Link
                href="/lobby"
                className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-semibold"
              >
                Lobby
              </Link>
              <Link
                href="/game"
                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-xl font-semibold"
              >
                Multiplayer
              </Link>
              <Link
                href="/practice"
                className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl font-semibold"
              >
                Practice
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Player Stats</h2>

            <button
              onClick={loadPlayers}
              disabled={loading}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {players.length === 0 ? (
            <p className="text-white/70">No players found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-white/70">
                    <th className="py-3 pr-4">Username</th>
                    <th className="py-3 pr-4">Bankroll</th>
                    <th className="py-3 pr-4">Played</th>
                    <th className="py-3 pr-4">Won</th>
                    <th className="py-3 pr-4">Lost</th>
                    <th className="py-3 pr-4">Pushed</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {players.map((player) => (
                    <tr key={player.id} className="border-b border-white/5">
                      <td className="py-4 pr-4 font-semibold">{player.username}</td>
                      <td className="py-4 pr-4 text-yellow-300">${player.bankroll}</td>
                      <td className="py-4 pr-4">{player.hands_played}</td>
                      <td className="py-4 pr-4 text-green-300">{player.hands_won}</td>
                      <td className="py-4 pr-4 text-red-300">{player.hands_lost}</td>
                      <td className="py-4 pr-4 text-blue-300">{player.hands_pushed}</td>
                      <td className="py-4 pr-4">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => addBankroll(player.id, player.bankroll, 100)}
                            className="bg-green-600 hover:bg-green-500 px-3 py-2 rounded-lg text-sm font-semibold"
                          >
                            +100
                          </button>

                          <button
                            onClick={() =>
                              updateBankroll(player.id, Math.max(0, player.bankroll - 100))
                            }
                            className="bg-red-600 hover:bg-red-500 px-3 py-2 rounded-lg text-sm font-semibold"
                          >
                            -100
                          </button>

                          <button
                            onClick={() => resetStats(player.id)}
                            className="bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-2 rounded-lg text-sm font-semibold"
                          >
                            Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}