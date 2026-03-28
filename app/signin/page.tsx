"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
};

const DEFAULT_STATS: Stats = {
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
};

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "create">("login");
  const [message, setMessage] = useState("");

  function handleSubmit() {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setMessage("Enter a username and password.");
      return;
    }

    const raw = localStorage.getItem("limoncitos_accounts");
    const accounts: Account[] = raw ? JSON.parse(raw) : [];

    if (mode === "create") {
      const exists = accounts.find((a) => a.username === cleanUsername);
      if (exists) {
        setMessage("That username already exists.");
        return;
      }

      const newAccount: Account = {
        username: cleanUsername,
        password: cleanPassword,
        bankroll: 1000,
        stats: DEFAULT_STATS,
      };

      const updated = [...accounts, newAccount];
      localStorage.setItem("limoncitos_accounts", JSON.stringify(updated));
      localStorage.setItem("limoncitos_current_user", cleanUsername);

      setMessage("Account created. Redirecting...");
      router.push("/practice");
      return;
    }

    const found = accounts.find(
      (a) => a.username === cleanUsername && a.password === cleanPassword
    );

    if (!found) {
      setMessage("Invalid username or password.");
      return;
    }

    localStorage.setItem("limoncitos_current_user", cleanUsername);
    setMessage("Signed in. Redirecting...");
    router.push("/practice");
  }

  return (
    <main className="min-h-screen bg-green-950 text-white p-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-black/20 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <Link href="/" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg">
            ← Main Menu
          </Link>
          <h1 className="text-2xl font-bold">Sign In</h1>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode("login")}
            className={`px-4 py-2 rounded-lg font-semibold ${
              mode === "login" ? "bg-yellow-500 text-black" : "bg-white/10"
            }`}
          >
            Login
          </button>

          <button
            onClick={() => setMode("create")}
            className={`px-4 py-2 rounded-lg font-semibold ${
              mode === "create" ? "bg-yellow-500 text-black" : "bg-white/10"
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-green-200 mb-1">Username</p>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full text-black p-3 rounded-lg"
            />
          </div>

          <div>
            <p className="text-sm text-green-200 mb-1">Password</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-black p-3 rounded-lg"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-lg font-semibold"
          >
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </div>

        <p className="mt-4 text-center text-green-100">{message}</p>
      </div>
    </main>
  );
}