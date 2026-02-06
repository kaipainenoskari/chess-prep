-- Cache monthly game archives from Chess.com
CREATE TABLE IF NOT EXISTS game_archives (
  player_username TEXT NOT NULL,
  year_month TEXT NOT NULL,
  games_json TEXT NOT NULL,
  fetched_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (player_username, year_month)
);

-- Cache player stats
CREATE TABLE IF NOT EXISTS player_stats (
  username TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  fetched_at INTEGER DEFAULT (unixepoch())
);

-- Cache Lichess opening explorer results
CREATE TABLE IF NOT EXISTS opening_explorer_cache (
  fen TEXT NOT NULL,
  speeds TEXT NOT NULL,
  ratings TEXT NOT NULL,
  result_json TEXT NOT NULL,
  fetched_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (fen, speeds, ratings)
);
