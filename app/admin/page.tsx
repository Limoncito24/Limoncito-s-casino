"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Account = {
  id: string;
  user_id: string;
  username: string;
  bankroll: number;
  hands_played: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  busts: number;
  splits: number;
  doubles: number;
  surrenders: number;
  buster_wins: number;
  banned: boolean;
  is_admin: boolean;
  created_at: string;
};

export default function AdminPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  async function loadAccounts() {
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("LOAD ACCOUNTS ERROR:", error);
      return;
    }

    setAccounts(data || []);
  }

  async function setBankroll(userId: string, amount: number) {
    const { error } = await supabase
      .from("player_stats")
      .update({ bankroll: amount })
      .eq("user_id", userId);

    if (error) {
      console.error("SET BANKROLL ERROR:", error);
      return;
    }

    loadAccounts();
  }

  async function resetStats(userId: string) {
    const { error } = await supabase
      .from("player_stats")
      .update({
        bankroll: 1000,
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
      console.error("RESET STATS ERROR:", error);
      return;
    }

    loadAccounts();
  }

  async function toggleBan(userId: string, banned: boolean) {
    const { error } = await supabase
      .from("player_stats")
      .update({ banned: !banned })
      .eq("user_id", userId);

    if (error) {
      console.error("TOGGLE BAN ERROR:", error);
      return;
    }

    loadAccounts();
  }

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("player_stats")
        .select("is_admin")
        .eq("user_id", user.id)
        .single();

      if (error || !data?.is_admin) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      setAllowed(true);
      await loadAccounts();
      setLoading(false);
    }

    checkAdmin();

    const channel = supabase
      .channel("player-stats-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_stats" },
        () => {
          loadAccounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-green-950 text-white p-8">
        Loading...
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-green-950 text-white p-8">
        <h1 className="text-3xl font-bold">Access Denied</h1>
        <p className="mt-4">You are not allowed to view this page.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-green-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="bg-white/10 px-4 py-2 rounded-lg">
            ← Main Menu
          </Link>

          <h1 className="text-3xl font-bold">Admin Panel</h1>

          <button
            type="button"
            onClick={loadAccounts}
            className="bg-blue-600 px-4 py-2 rounded-lg font-semibold"
          >
            Refresh
          </button>
        </div>

        {accounts.length === 0 ? (
          <p>No accounts found.</p>
        ) : (
          <div className="space-y-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-black/20 rounded-xl p-4">
                <h2 className="text-xl font-bold">{acc.username}</h2>
                <p>Bankroll: {acc.bankroll}</p>
                <p>Hands: {acc.hands_played}</p>
                <p>Wins: {acc.wins}</p>
                <p>Losses: {acc.losses}</p>
                <p>Pushes: {acc.pushes}</p>
                <p>Blackjacks: {acc.blackjacks}</p>
                <p>Busts: {acc.busts}</p>
                <p>Splits: {acc.splits}</p>
                <p>Doubles: {acc.doubles}</p>
                <p>Surrenders: {acc.surrenders}</p>
                <p>Buster Wins: {acc.buster_wins}</p>
                <p>Banned: {acc.banned ? "Yes" : "No"}</p>
                <p>Admin: {acc.is_admin ? "Yes" : "No"}</p>

                <div className="flex gap-2 flex-wrap mt-4">
                  <button
                    onClick={() => setBankroll(acc.user_id, 1000)}
                    className="bg-yellow-600 px-3 py-2 rounded"
                  >
                    Set 1000
                  </button>

                  <button
                    onClick={() => setBankroll(acc.user_id, 5000)}
                    className="bg-green-600 px-3 py-2 rounded"
                  >
                    Set 5000
                  </button>

                  <button
                    onClick={() => resetStats(acc.user_id)}
                    className="bg-red-600 px-3 py-2 rounded"
                  >
                    Reset Stats
                  </button>

                  <button
                    onClick={() => toggleBan(acc.user_id, acc.banned)}
                    className="bg-purple-600 px-3 py-2 rounded"
                  >
                    {acc.banned ? "Unban" : "Ban"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}