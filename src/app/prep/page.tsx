"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface PrepProject {
  id: string;
  opponentUsername: string;
  color: string;
  ratingBucket: string;
  status: string;
  timeClass: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PrepProjectsPage() {
  const [projects, setProjects] = useState<PrepProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [opponentUsername, setOpponentUsername] = useState("");
  const [color, setColor] = useState<"white" | "black">("black");
  const [ratingBucket, setRatingBucket] = useState("1600-1800");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prep/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      const data = (await res.json()) as { projects: PrepProject[] };
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = opponentUsername.trim();
      if (!trimmed) return;
      setCreating(true);
      setCreateError(null);
      try {
        const res = await fetch("/api/prep/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opponentUsername: trimmed,
            color,
            ratingBucket,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? body.errors?.[0]?.message ?? "Create failed");
        }
        const data = (await res.json()) as { project: { id: string } };
        window.location.href = `/prep/projects/${data.project.id}`;
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setCreating(false);
      }
    },
    [opponentUsername, color, ratingBucket],
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-400">
        Loading projects…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Prep projects</h1>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 rounded-lg bg-chess-accent hover:bg-purple-600 text-white font-medium transition-colors"
        >
          {showForm ? "Cancel" : "New project"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 p-4 rounded-xl border border-chess-border bg-chess-card space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Opponent (Chess.com username)
            </label>
            <input
              type="text"
              value={opponentUsername}
              onChange={(e) => setOpponentUsername(e.target.value)}
              placeholder="username"
              className="w-full px-3 py-2 rounded-lg bg-chess-bg border border-chess-border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-chess-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Your color
            </label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as "white" | "black")}
              className="w-full px-3 py-2 rounded-lg bg-chess-bg border border-chess-border text-white focus:outline-none focus:ring-2 focus:ring-chess-accent"
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Rating bucket (Lichess)
            </label>
            <input
              type="text"
              value={ratingBucket}
              onChange={(e) => setRatingBucket(e.target.value)}
              placeholder="1600-1800"
              className="w-full px-3 py-2 rounded-lg bg-chess-bg border border-chess-border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-chess-accent"
            />
          </div>
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !opponentUsername.trim()}
            className="px-4 py-2 rounded-lg bg-chess-accent hover:bg-purple-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : "Create project"}
          </button>
        </form>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {projects.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-500 rounded-xl border border-chess-border bg-chess-card/50">
          <p className="mb-2">No prep projects yet.</p>
          <p className="text-sm">
            Create one to explore your opponent&apos;s tree and run deep analysis on
            positions.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-4 text-chess-accent hover:underline"
          >
            New project
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/prep/projects/${p.id}`}
                className="block p-4 rounded-xl border border-chess-border bg-chess-card hover:bg-chess-card/80 transition-colors"
              >
                <span className="font-semibold text-chess-accent">
                  {p.opponentUsername}
                </span>
                <span className="text-gray-400 ml-2">
                  — Prep as {p.color === "white" ? "White" : "Black"} · {p.ratingBucket}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Link href="/" className="text-sm text-gray-400 hover:text-chess-accent">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
