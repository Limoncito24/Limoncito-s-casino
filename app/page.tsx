import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-green-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">Limoncitos Casino</h1>
      <p className="text-lg text-green-100 mb-8 text-center max-w-xl">
        Private blackjack. Custom house rules. Practice anytime.
      </p>

      <div className="flex flex-wrap gap-4 mb-10 justify-center">
        <Link
          href="/signin"
          className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-6 py-3 rounded-xl"
        >
          Sign In
        </Link>

        <Link
          href="/practice"
          className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl"
        >
          Practice Table
        </Link>

        <Link
          href="/admin"
          className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl"
        >
          Admin
        </Link>
      </div>

      <div className="bg-white/10 rounded-2xl p-6 max-w-xl w-full">
        <h2 className="text-2xl font-semibold mb-3">Current Setup</h2>
        <ul className="space-y-2 text-green-100">
          <li>• 3 Decks</li>
          <li>• Dealer stands on soft 17</li>
          <li>• Blackjack pays 3:2</li>
          <li>• DAS allowed</li>
          <li>• Split any 10-value cards</li>
          <li>• Surrender available</li>
          <li>• Buster side bet</li>
        </ul>
      </div>
    </main>
  );
}