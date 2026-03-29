"use client";

import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h1 className="text-4xl font-bold mb-2">Admin Panel</h1>
          <p className="text-white/70">Game controls and quick links</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href="/lobby"
            className="block bg-blue-600 hover:bg-blue-500 rounded-xl p-5 font-semibold text-center"
          >
            Go to Multiplayer Lobby
          </Link>

          <Link
            href="/game"
            className="block bg-green-600 hover:bg-green-500 rounded-xl p-5 font-semibold text-center"
          >
            Go to Multiplayer Table
          </Link>

          <Link
            href="/practice"
            className="block bg-purple-600 hover:bg-purple-500 rounded-xl p-5 font-semibold text-center"
          >
            Go to Practice Table
          </Link>

          <Link
            href="/"
            className="block bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl p-5 font-semibold text-center"
          >
            Go Home
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-3">Admin Notes</h2>
          <div className="space-y-2 text-white/80">
            <p>- Multiplayer game lives at <span className="text-white">/game</span></p>
            <p>- Lobby lives at <span className="text-white">/lobby</span></p>
            <p>- Single player practice lives at <span className="text-white">/practice</span></p>
          </div>
        </div>
      </div>
    </main>
  );
}