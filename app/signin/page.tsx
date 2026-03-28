"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SignInPage() {
  const [mode, setMode] = useState<"login" | "create">("create");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateAccount() {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanEmail || !cleanPassword) {
      setMessage("Enter username, email, and password.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Creating account...");

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setMessage("Signup error: " + error.message);
        return;
      }

      if (!data.user) {
        setMessage("Signup failed: no user returned.");
        return;
      }

      const { error: insertError } = await supabase.from("player_stats").upsert({
        user_id: data.user.id,
        username: cleanUsername,
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
        banned: false,
        is_admin: false,
      });

      if (insertError) {
        setMessage("Stats row error: " + insertError.message);
        return;
      }

      setMessage("Account created successfully.");
    } catch (err) {
      console.error(err);
      setMessage("Something crashed during signup.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setMessage("Enter email and password.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Logging in...");

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setMessage("Login error: " + error.message);
        return;
      }

      if (!data.user) {
        setMessage("Login failed.");
        return;
      }

      setMessage("Login worked.");
    } catch (err) {
      console.error(err);
      setMessage("Something crashed during login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-green-950 text-white p-8 flex items-center justify-center">
      <div className="w-full max-w-md bg-black/20 rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-center">NEW SIGNIN PAGE</h1>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            className={`px-4 py-2 rounded-lg ${
              mode === "login" ? "bg-yellow-500 text-black" : "bg-white/10"
            }`}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("create");
              setMessage("");
            }}
            className={`px-4 py-2 rounded-lg ${
              mode === "create" ? "bg-yellow-500 text-black" : "bg-white/10"
            }`}
          >
            Create
          </button>
        </div>

        {mode === "create" && (
          <input
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 rounded-lg text-black bg-white"
          />
        )}

        <input
          placeholder="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded-lg text-black bg-white"
        />

        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded-lg text-black bg-white"
        />

        {mode === "create" ? (
          <button
            type="button"
            onClick={handleCreateAccount}
            disabled={loading}
            className="w-full bg-green-600 py-3 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 py-3 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        )}

        <p className="text-center text-sm text-green-100 min-h-[24px]">{message}</p>
      </div>
    </main>
  );
}