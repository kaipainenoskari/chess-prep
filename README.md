# Chess Prep

Analyze Chess.com opponents — find their opening weaknesses, time trouble patterns, and exploitable habits. Also rank candidate lines by **practical difficulty** (engine + human data).

<!-- screenshot placeholder: replace with an actual screenshot of the analysis dashboard -->

## How to run the app

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- npm 9+

### 1. Install dependencies

```bash
npm install
```

### 2. Run the app (opponent analysis only)

Copy `.env.local.example` to `.env.local` and set `DATABASE_URL` (Prisma loads at startup; use your Postgres URL or create a local DB). No Redis or worker needed for opponent analysis; SQLite cache is created automatically.

```bash
cp .env.local.example .env.local
# Edit .env.local: set DATABASE_URL to e.g. postgresql://user:password@localhost:5432/chess_prep

npx prisma migrate deploy   # create tables
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter a Chess.com username to analyze openings, time management, and weaknesses.

If you see **"Environment variable not found: DATABASE_URL"**, add `DATABASE_URL` to `.env.local` (see `.env.local.example`).

### 3. Run the full stack (including Line difficulty)

To use **Line difficulty** ([http://localhost:3000/analyze-position](http://localhost:3000/analyze-position)) you need PostgreSQL, Redis, and the worker.

1. **Env** — copy `.env.local.example` to `.env.local` and set:
   - `DATABASE_URL` — PostgreSQL connection string
   - `REDIS_URL` — optional; defaults to `redis://localhost:6379`

2. **PostgreSQL** — create a database (e.g. `chess_prep`) and set its URL in `DATABASE_URL`.

3. **Redis** — start Redis (e.g. `redis-server`). Default: `redis://localhost:6379`.

4. **Apply migrations:**

   ```bash
   npx prisma migrate deploy
   ```

5. **Start the app:**

   ```bash
   npm run dev
   ```

6. **In a separate terminal, start the worker** (processes line-analysis jobs):

   ```bash
   npm run worker
   ```

Then open [http://localhost:3000/analyze-position](http://localhost:3000/analyze-position), enter a FEN, and click **Analyze position**. The worker will run the analysis; when it finishes, ranked lines appear on the page.

## How It Works

Enter any Chess.com username and the tool fetches their recent games, then runs four analyses:

| Section                | What it tells you                                                                |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Player Overview**    | Ratings, overall record, win rate by colour, recent form                         |
| **Opening Repertoire** | Interactive opening tree with win rates for White and Black                      |
| **Time Management**    | Average clock curve, time-trouble frequency, flag rate, time spent by game phase |
| **Weakness Report**    | Auto-detected weaknesses and strengths with severity, stats, and recommendations |

### Data Sources

- **Chess.com API** — player profiles, stats, and game archives
- **Lichess Opening Explorer** — population-level opening statistics for comparison
- **Lichess Cloud Eval / Chess-API.com** — Stockfish position evaluations

Results are cached in a local SQLite database so repeated lookups are fast.

## Available Scripts

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start dev server (Turbopack)             |
| `npm run build`         | Production build                         |
| `npm start`             | Start production server                  |
| `npm run worker`        | Start BullMQ worker (line-analysis jobs) |
| `npm run lint`          | Run ESLint                               |
| `npm run lint:fix`      | Auto-fix lint issues                     |
| `npm run format`        | Format all files with Prettier           |
| `npm run format:check`  | Check formatting without writing         |
| `npm run type-check`    | Run TypeScript type checker              |
| `npm test`              | Run tests once                           |
| `npm run test:watch`    | Run tests in watch mode                  |
| `npm run test:coverage` | Run tests with coverage report           |

## Tech Stack

- **Framework** — [Next.js](https://nextjs.org/) 16 (App Router)
- **Language** — TypeScript 5 (strict mode)
- **UI** — React 19, Tailwind CSS 4, Recharts, react-chessboard
- **Databases** — SQLite (better-sqlite3) for opponent-analysis cache; PostgreSQL (Prisma) for line-analysis cache and results
- **Queue & cache** — Redis + BullMQ for async line-analysis jobs and caching
- **Chess** — chess.js for PGN parsing and position handling
- **Testing** — Vitest
- **Linting** — ESLint (next/core-web-vitals + TypeScript), Prettier
- **CI** — GitHub Actions

## Project Structure

```
src/
├── app/                         # Next.js App Router pages & API routes
│   ├── api/                     # REST endpoints
│   │   ├── analyze-position/    # POST — enqueue line-analysis job
│   │   ├── job/[id]/            # GET — job status
│   │   ├── line-analysis/       # GET — lines by root FEN
│   │   ├── player/[username]/   # profile, games, analysis
│   │   ├── openings/explore/    # Lichess explorer
│   │   ├── prep/suggest/        # Prep suggestions
│   │   └── eval/                # Engine eval
│   ├── analyze/[username]/      # Opponent analysis dashboard
│   ├── analyze-position/       # Line difficulty page
│   └── page.tsx                 # Landing page
├── components/
│   ├── analyze-position/        # FEN input, job status, line results
│   ├── opening-repertoire/      # Board, move explorer, prep
│   ├── PlayerOverview.tsx
│   ├── TimeAnalysis.tsx
│   ├── WeaknessReport.tsx
│   └── ...
└── lib/
    ├── analysis/                # Pure analysis (openings, time, weaknesses, metrics)
    ├── engine/                  # Multi-PV analysis + PositionCache
    ├── lichess/                 # Explorer + getHumanMoves
    ├── queue/                   # BullMQ queue + line-analysis processor
    ├── cache.ts                 # Redis get/set + key helpers
    ├── config.ts
    ├── prisma.ts                # Prisma client (PostgreSQL)
    ├── db.ts                    # SQLite (opponent cache)
    ├── validation.ts
    ├── chess-com.ts
    ├── lichess.ts
    └── types.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes — the pre-commit hook will lint and format automatically
4. Run tests (`npm test`) and type-check (`npm run type-check`)
5. Commit and push
6. Open a Pull Request

## License

[MIT](LICENSE)
