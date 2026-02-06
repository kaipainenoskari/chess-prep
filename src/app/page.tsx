"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [username, setUsername] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim().toLowerCase();
    if (trimmed) {
      router.push(`/analyze/${trimmed}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold mb-4">
          <span className="text-chess-accent">Prepare</span> Against Any Opponent
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Enter a Chess.com username to analyze their opening repertoire, time management,
          and weaknesses.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Chess.com username..."
            className="flex-1 px-4 py-3 rounded-lg bg-chess-card border border-chess-border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-chess-accent focus:border-transparent text-lg"
            autoFocus
          />
          <button
            type="submit"
            disabled={!username.trim()}
            className="px-6 py-3 rounded-lg bg-chess-accent hover:bg-purple-600 text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Analyze
          </button>
        </div>
      </form>

      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        {[
          {
            icon: "&#9813;",
            title: "Opening Repertoire",
            desc: "See what they play and where they struggle",
          },
          {
            icon: "&#9200;",
            title: "Time Analysis",
            desc: "Find if they crack under time pressure",
          },
          {
            icon: "&#127919;",
            title: "Weakness Report",
            desc: "Get actionable preparation advice",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-chess-card border border-chess-border rounded-xl p-5 text-center"
          >
            <div className="text-3xl mb-2" dangerouslySetInnerHTML={{ __html: f.icon }} />
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
