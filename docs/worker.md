# Line analysis worker

The backend analysis pipeline runs heavy work (engine + Lichess API + difficulty scoring) in a **separate process** via BullMQ.

## Run the worker

```bash
npm run worker
```

Or with env from a file:

```bash
REDIS_URL=redis://localhost:6379 DATABASE_URL="postgresql://..." npm run worker
```

Requires:

- **Redis** running (default `redis://localhost:6379`).
- **PostgreSQL** with migrations applied (`npx prisma migrate deploy`).

The worker listens to the `line-analysis` queue. Jobs are enqueued by `POST /api/analyze-position` with a FEN in the body.

### Debugging failed jobs

To log move application and FEN castling fields (to debug "Invalid move" errors), run with:

```bash
# Bash / Git Bash
LOG_LINE_ANALYSIS=1 npm run worker

# Windows CMD
set LOG_LINE_ANALYSIS=1 && npm run worker

# PowerShell
$env:LOG_LINE_ANALYSIS="1"; npm run worker
```

Or `DEBUG=line npm run worker`. Logs go to stderr and show each step’s FEN castling field, raw UCI move, and on failure the position’s legal moves.
