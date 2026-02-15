import { getDb } from "./db";
import {
  CHESS_COM_API_BASE,
  CHESS_COM_USER_AGENT,
  CACHE_PLAYER_STATS_TTL,
  CACHE_CURRENT_MONTH_TTL,
} from "./config";
import type { ChessComProfile, ChessComStats, ChessComGame } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": CHESS_COM_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Chess.com API error: ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProfile(username: string): Promise<ChessComProfile> {
  return fetchJson<ChessComProfile>(`${CHESS_COM_API_BASE}/player/${username}`);
}

export async function fetchStats(username: string): Promise<ChessComStats> {
  return fetchJson<ChessComStats>(`${CHESS_COM_API_BASE}/player/${username}/stats`);
}

export async function fetchProfileCached(
  username: string,
): Promise<{ profile: ChessComProfile; stats: ChessComStats }> {
  const db = getDb();
  const cached = db
    .prepare(
      "SELECT profile_json, stats_json, fetched_at FROM player_stats WHERE username = ?",
    )
    .get(username) as
    | { profile_json: string; stats_json: string; fetched_at: number }
    | undefined;

  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.fetched_at < CACHE_PLAYER_STATS_TTL) {
    return {
      profile: JSON.parse(cached.profile_json),
      stats: JSON.parse(cached.stats_json),
    };
  }

  const [profile, stats] = await Promise.all([
    fetchProfile(username),
    fetchStats(username),
  ]);

  db.prepare(
    `INSERT OR REPLACE INTO player_stats (username, profile_json, stats_json, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(username, JSON.stringify(profile), JSON.stringify(stats), now);

  return { profile, stats };
}

async function fetchArchiveList(username: string): Promise<string[]> {
  const data = await fetchJson<{ archives: string[] }>(
    `${CHESS_COM_API_BASE}/player/${username}/games/archives`,
  );
  return data.archives;
}

async function fetchMonthGames(archiveUrl: string): Promise<ChessComGame[]> {
  const data = await fetchJson<{ games: ChessComGame[] }>(archiveUrl);
  return data.games;
}

/**
 * Fetch games from Chess.com, with optional month limit.
 * @param username - Chess.com username
 * @param monthsBack - Number of months to include (most recent). Use 0 for all games.
 */
export async function fetchAllGamesCached(
  username: string,
  monthsBack: number = 6,
): Promise<ChessComGame[]> {
  const db = getDb();
  const archives = await fetchArchiveList(username);

  const recentArchives = monthsBack <= 0 ? archives : archives.slice(-monthsBack);
  const allGames: ChessComGame[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const archiveUrl of recentArchives) {
    const parts = archiveUrl.split("/");
    const yearMonth = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;

    const cached = db
      .prepare(
        "SELECT games_json, fetched_at FROM game_archives WHERE player_username = ? AND year_month = ?",
      )
      .get(username, yearMonth) as { games_json: string; fetched_at: number } | undefined;

    const isCurrentMonth = archiveUrl === archives[archives.length - 1];
    const cacheValid =
      cached && (!isCurrentMonth || now - cached.fetched_at < CACHE_CURRENT_MONTH_TTL);

    if (cacheValid) {
      allGames.push(...JSON.parse(cached!.games_json));
    } else {
      const games = await fetchMonthGames(archiveUrl);
      db.prepare(
        `INSERT OR REPLACE INTO game_archives (player_username, year_month, games_json, fetched_at)
         VALUES (?, ?, ?, ?)`,
      ).run(username, yearMonth, JSON.stringify(games), now);
      allGames.push(...games);
    }
  }

  return allGames.filter((g) => g.rules === "chess");
}
