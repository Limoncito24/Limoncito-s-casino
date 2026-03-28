import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-green-950 text-white flex items-center justify-center p-8">
      <div className="w-full max-w-2xl bg-black/20 rounded-2xl p-8 text-center">
        <h1 className="text-4xl font-bold mb-4">Limoncitos Casino</h1>
        <p className="text-green-100 mb-8">Choose where you want to go</p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signin"
            className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-3 rounded-xl font-semibold"
          >
            Sign In
          </Link>

          <Link
            href="/practice"
            className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-xl font-semibold"
          >
            Practice
          </Link>

          <Link
            href="/admin"
            className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-semibold"
          >
            Admin
          </Link>
        </div>
      </div>
    </main>
  );
}