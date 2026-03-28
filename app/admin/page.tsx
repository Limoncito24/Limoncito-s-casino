"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

type Account = {
  username: string;
  password: string;
  bankroll: number;
  stats: Stats;
  banned?: boolean;
};

const STARTING_BANKROLL = 1000;
const ADMIN_USERS = ["limoncito"]; // change this to your exact username

export default function AdminPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUser, setCurrentUser] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const rawAccounts = localStorage.getItem("limoncitos_accounts");
    const rawCurrent = localStorage.getItem("limoncitos_current_user") || "";

    setAccounts(rawAccounts ? JSON.parse(rawAccounts) : []);
    setCurrentUser(rawCurrent);
    setIsAdmin(ADMIN_USERS.includes(rawCurrent));
  }, []);

  function refreshAccounts() {
    const rawAccounts = localStorage.getItem("limoncitos_accounts");
    setAccounts(rawAccounts ? JSON.parse(rawAccounts) : []);
  }

  function saveAccounts(updated: Account[]) {
    localStorage.setItem("limoncitos_accounts", JSON.stringify(updated));
    setAccounts(updated);
  }

  function deleteAccount(username: string) {
    const filtered = accounts.filter((a) => a.username !== username);
    saveAccounts(filtered);

    if (currentUser === username) {
      localStorage.removeItem("limoncitos_current_user");
      setCurrentUser("");
      setIsAdmin(false);
    }
  }

  function signOut() {
    localStorage.removeItem("limoncitos_current_user");
    setCurrentUser("");
    setIsAdmin(false);
  }

  function addBankroll(username: string, amount: number) {
    const updated = accounts.map((account) =>
      account.username === username
        ? { ...account, bankroll: account.bankroll + amount }
        : account
    );
    saveAccounts(updated);
  }

  function subtractBankroll(username: string, amount: number) {
    const updated = accounts.map((account) =>
      account.username === username
        ? { ...account, bankroll: Math.max(0, account.bankroll - amount) }
        : account
    );
    saveAccounts(updated);
  }

  function resetBankroll(username: string) {
    const updated = accounts.map((account) =>
      account.username === username
        ? { ...account, bankroll: STARTING_BANKROLL }
        : account
    );
    saveAccounts(updated);
  }

  function toggleBan(username: string) {
    const updated = accounts.map((account) =>
      account.username === username
        ? { ...account, banned: !account.banned }
        : account
    );
    saveAccounts(updated);

    const bannedUser = updated.find((a) => a.username === username);
    if (bannedUser?.banned && currentUser === username) {
      localStorage.removeItem("limoncitos_current_user");
      setCurrentUser("");
      setIsAdmin(false);
    }
  }

  function resetStats(username: string) {
    const updated = accounts.map((account) =>
      account.username === username
        ? {
            ...account,
            stats: {
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
            },
          }
        : account
    );
    saveAccounts(updated);
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-green-950 text-white p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-black/20 rounded-2xl p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-green-100 mb-6">
            You are signed in as: <span className="font-bold">{currentUser || "None"}</span>
          </p>
          <p className="text-green-100 mb-6">
            This page is only for admin accounts.
          </p>

          <div className="flex justify-center gap-3">
            <Link
              href="/"
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg"
            >
              Main Menu
            </Link>
            <Link
              href="/signin"
              className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded-lg font-semibold"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-green-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg">
            ← Main Menu
          </Link>

          <h1 className="text-3xl font-bold">Admin Panel</h1>

          <button
            onClick={signOut}
            className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded-lg font-semibold"
          >
            Sign Out
          </button>
        </div>

        <div className="bg-black/20 rounded-2xl p-4 mb-6">
          <p className="text-green-200">Current Signed-In Admin</p>
          <p className="text-2xl font-bold">{currentUser || "None"}</p>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-black/20 rounded-2xl p-6 text-center">
            No accounts yet.
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => {
              const lifetimeNet = account.bankroll - STARTING_BANKROLL;

              return (
                <div key={account.username} className="bg-black/20 rounded-2xl p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        {account.username}
                        {account.banned && (
                          <span className="text-sm bg-red-700 px-2 py-1 rounded">
                            BANNED
                          </span>
                        )}
                      </h2>
                      <p className="text-green-200">
                        Bankroll: {account.bankroll} | Net: {lifetimeNet > 0 ? "+" : ""}
                        {lifetimeNet}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => addBankroll(account.username, 100)}
                        className="bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg font-semibold"
                      >
                        +100
                      </button>

                      <button
                        onClick={() => subtractBankroll(account.username, 100)}
                        className="bg-orange-700 hover:bg-orange-600 px-3 py-2 rounded-lg font-semibold"
                      >
                        -100
                      </button>

                      <button
                        onClick={() => resetBankroll(account.username)}
                        className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg font-semibold"
                      >
                        Reset Bankroll
                      </button>

                      <button
                        onClick={() => resetStats(account.username)}
                        className="bg-purple-700 hover:bg-purple-600 px-3 py-2 rounded-lg font-semibold"
                      >
                        Reset Stats
                      </button>

                      <button
                        onClick={() => toggleBan(account.username)}
                        className={`px-3 py-2 rounded-lg font-semibold ${
                          account.banned
                            ? "bg-green-700 hover:bg-green-600"
                            : "bg-red-700 hover:bg-red-600"
                        }`}
                      >
                        {account.banned ? "Unban" : "Ban"}
                      </button>

                      <button
                        onClick={() => deleteAccount(account.username)}
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-5 gap-3">
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Hands</p>
                      <p className="text-xl font-bold">{account.stats.handsPlayed}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Wins</p>
                      <p className="text-xl font-bold">{account.stats.wins}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Losses</p>
                      <p className="text-xl font-bold">{account.stats.losses}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Pushes</p>
                      <p className="text-xl font-bold">{account.stats.pushes}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Blackjacks</p>
                      <p className="text-xl font-bold">{account.stats.blackjacks}</p>
                    </div>

                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Busts</p>
                      <p className="text-xl font-bold">{account.stats.busts}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Splits</p>
                      <p className="text-xl font-bold">{account.stats.splits}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Doubles</p>
                      <p className="text-xl font-bold">{account.stats.doubles}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Surrenders</p>
                      <p className="text-xl font-bold">{account.stats.surrenders}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-sm text-green-200">Buster Wins</p>
                      <p className="text-xl font-bold">{account.stats.busterWins}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}