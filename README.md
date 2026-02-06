# Chess Prep

Analyze Chess.com opponents — find their opening weaknesses, time trouble patterns, and exploitable habits.

<!-- screenshot placeholder: replace with an actual screenshot of the analysis dashboard -->

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- npm 9+

### Install & Run

```bash
# Install dependencies
npm install

# Start the development server (Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter a Chess.com username to analyze.

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

| Command                 | Description                      |
| ----------------------- | -------------------------------- |
| `npm run dev`           | Start dev server (Turbopack)     |
| `npm run build`         | Production build                 |
| `npm start`             | Start production server          |
| `npm run lint`          | Run ESLint                       |
| `npm run lint:fix`      | Auto-fix lint issues             |
| `npm run format`        | Format all files with Prettier   |
| `npm run format:check`  | Check formatting without writing |
| `npm run type-check`    | Run TypeScript type checker      |
| `npm test`              | Run tests once                   |
| `npm run test:watch`    | Run tests in watch mode          |
| `npm run test:coverage` | Run tests with coverage report   |

## Tech Stack

- **Framework** — [Next.js](https://nextjs.org/) 16 (App Router)
- **Language** — TypeScript 5 (strict mode)
- **UI** — React 19, Tailwind CSS 4, Recharts, react-chessboard
- **Database** — SQLite via better-sqlite3 (local caching)
- **Chess** — chess.js for PGN parsing
- **Testing** — Vitest
- **Linting** — ESLint (next/core-web-vitals + TypeScript), Prettier
- **CI** — GitHub Actions

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/                # REST endpoints (player, openings, eval)
│   ├── analyze/[username]/ # Analysis dashboard page
│   └── page.tsx            # Landing page with search
├── components/             # React components
│   ├── PlayerOverview.tsx
│   ├── OpeningRepertoire.tsx
│   ├── TimeAnalysis.tsx
│   └── WeaknessReport.tsx
└── lib/                    # Core logic
    ├── analysis/           # Pure analysis modules (testable)
    │   ├── openings.ts
    │   ├── time.ts
    │   ├── performance.ts
    │   ├── weaknesses.ts
    │   └── parse-games.ts
    ├── config.ts           # Centralised thresholds & constants
    ├── validation.ts       # Input validation utilities
    ├── chess-com.ts        # Chess.com API client
    ├── lichess.ts          # Lichess API client
    ├── db.ts               # SQLite connection
    └── types.ts            # Shared TypeScript interfaces
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
