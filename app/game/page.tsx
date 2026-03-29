"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

/* ---------- TYPES ---------- */

type LobbyPlayer = {
  id: string;
  username: string;
};

type Hand = {
  cards: string[];
  bet: number;
  done: boolean;
  busted: boolean;
  surrendered: boolean;
  doubled: boolean;
  result?: "win" | "lose" | "push" | "bust" | "surrender";
};

type GameState = {
  deck: string[];
  playerHands: Record<string, Hand[]>;
  activeHandIndex: Record<string, number>;
  dealerHand: string[];
  roundStarted: boolean;
  roundFinished: boolean;
  dealerRevealed: boolean;
  betsLocked: boolean;
};

type PlayerStatRow = {
  username: string;
  bankroll: number | null;
  hands_played: number | null;
  hands_won: number | null;
  hands_lost: number | null;
  hands_pushed: number | null;
};

/* ---------- DEFAULT STATE ---------- */

const EMPTY_GAME_STATE: GameState = {
  deck: [],
  playerHands: {},
  activeHandIndex: {},
  dealerHand: [],
  roundStarted: false,
  roundFinished: false,
  dealerRevealed: false,
  betsLocked: false,
};

/* ---------- UTILS ---------- */

function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: string[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function getValue(card: string) {
  const rank = card.slice(0, -1);
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number(rank);
}

function total(cards: string[]) {
  let t = cards.reduce((s, c) => s + getValue(c), 0);
  let aces = cards.filter((c) => c.startsWith("A")).length;

  while (t > 21 && aces > 0) {
    t -= 10;
    aces--;
  }

  return t;
}

/* ---------- COMPONENT ---------- */

export default function GamePage() {
  const router = useRouter();

  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [gameState, setGameState] = useState<GameState>(EMPTY_GAME_STATE);
  const [turnIndex, setTurnIndex] = useState(0);
  const [currentUsername, setCurrentUsername] = useState("");
  const [bankrolls, setBankrolls] = useState<Record<string, number>>({});
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lp } = await supabase
      .from("lobby_players")
      .select("lobby_id")
      .eq("user_id", user?.id);

    const lobby = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", lp?.[0]?.lobby_id)
      .single();

    setLobbyId(lobby.data.id);
    setIsHost(lobby.data.host_user_id === user?.id);
    setTurnIndex(lobby.data.turn_index || 0);
    setGameState(lobby.data.game_state || EMPTY_GAME_STATE);

    const { data: playersRaw } = await supabase
      .from("lobby_players")
      .select("id, user_id")
      .eq("lobby_id", lobby.data.id);

    const { data: stats } = await supabase
      .from("player_stats")
      .select("username, bankroll");

    const mapped = playersRaw!.map((p) => {
      const s = stats!.find((x) => x.username);
      return { id: p.id, username: s?.username || "unknown" };
    });

    const br: Record<string, number> = {};
    stats!.forEach((s) => (br[s.username] = s.bankroll || 1000));

    setPlayers(mapped);
    setBankrolls(br);
    setCurrentUsername(stats!.find((s) => s.username)?.username || "");
  }

  async function handleDealerPlay() {
    if (!isHost) return;

    const deck = [...gameState.deck];
    const dealer = [...gameState.dealerHand];

    while (total(dealer) < 17) dealer.push(deck.pop()!);

    const dealerTotal = total(dealer);
    const dealerBust = dealerTotal > 21;

    const updated = { ...gameState, dealerHand: dealer, dealerRevealed: true };

    const statsPromises: Promise<unknown>[] = [];

    for (const p of players) {
      const username = p.username;
      const hands = updated.playerHands[username] || [];

      let change = 0;
      let won = 0;
      let lost = 0;
      let pushed = 0;
      let played = 0;

      hands.forEach((h) => {
        played++;

        if (h.surrendered) {
          change -= h.bet / 2;
          lost++;
          return;
        }

        if (h.busted) {
          change -= h.bet;
          lost++;
          return;
        }

        const t = total(h.cards);

        if (dealerBust || t > dealerTotal) {
          change += h.bet;
          won++;
        } else if (t < dealerTotal) {
          change -= h.bet;
          lost++;
        } else {
          pushed++;
        }
      });

      const { data: currentStats } = await supabase
        .from("player_stats")
        .select("*")
        .eq("username", username)
        .single<PlayerStatRow>();

      if (!currentStats) continue;

      // ✅ FIXED PROMISE
      statsPromises.push(
        (async () => {
          await supabase
            .from("player_stats")
            .update({
              bankroll: (currentStats.bankroll ?? 1000) + change,
              hands_played: (currentStats.hands_played ?? 0) + played,
              hands_won: (currentStats.hands_won ?? 0) + won,
              hands_lost: (currentStats.hands_lost ?? 0) + lost,
              hands_pushed: (currentStats.hands_pushed ?? 0) + pushed,
            })
            .eq("username", username);
        })()
      );
    }

    await Promise.all(statsPromises);

    await supabase
      .from("lobbies")
      .update({ game_state: updated })
      .eq("id", lobbyId);

    setGameState(updated);
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl mb-4">Blackjack</h1>

      <button
        onClick={handleDealerPlay}
        className="bg-indigo-600 px-4 py-2 rounded"
      >
        Run Dealer
      </button>
    </div>
  );
}