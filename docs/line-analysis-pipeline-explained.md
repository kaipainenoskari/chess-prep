# Line Analysis Pipeline — Technical Explanation

This document reconstructs the **actual** end-to-end algorithm that produces `LineAnalysis` in the codebase. No fixes are proposed; the goal is to understand why the system outputs long, branching, theory-like lines instead of forcing traps.

---

## Part 1 — Entry points

### Where line generation starts

| Role                                   | File                                                   | Function / export                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Queue definition**                   | `src/lib/queue/index.ts`                               | `lineAnalysisQueue` (BullMQ), job name `"line-analysis"`; payload `{ rootFen, projectId? }`.                                                                  |
| **Job processor**                      | `src/lib/queue/processor.ts`                           | `processLineAnalysisJob(data: LineAnalysisJobData)` — single entry point that runs when a worker picks a job.                                                 |
| **Enqueue from prep UI**               | `src/app/api/prep/projects/[id]/analyze-node/route.ts` | `POST` handler: validates FEN, calls `lineAnalysisQueue.add("analyze", { rootFen: fen, projectId })`, updates `OpeningTreeNode` status to `ANALYSIS_RUNNING`. |
| **Enqueue from analyze-position page** | `src/app/api/analyze-position/route.ts`                | `POST` handler: validates FEN, calls `lineAnalysisQueue.add("analyze", { rootFen })` (no projectId).                                                          |
| **UI trigger (prep tree)**             | `src/components/opening-repertoire/NodeActions.tsx`    | `handleDeepAnalyze`: `POST /api/prep/projects/${projectId}/analyze-node` with `{ fen: currentNode.fen }`. Button label: **"Deep analyze"**.                   |

### Services involved in the pipeline

| Concern                        | File(s)                                    | Notes                                                                                                                      |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Line expansion**             | `src/lib/analysis/expandRealisticLines.ts` | `expandRealisticLines()`, internal `expandStep()` (recursive).                                                             |
| **Difficulty scoring**         | `src/lib/analysis/metrics.ts`              | `computeLineDifficulty()`, `computeOpponentBranchingFactor()`.                                                             |
| **Engine analysis**            | `src/lib/engine/analyzePosition.ts`        | `analyzePosition(fen, depth, multipv)` — Lichess cloud eval or chess-api.com, cached in Redis + Postgres.                  |
| **Opponent move probability**  | `src/lib/opponent/moveProbability.ts`      | `getOpponentMoveDistribution(fen, opponentProfile)` — player (Chess.com) / Lichess / blended / engine.                     |
| **Human move stats (Lichess)** | `src/lib/lichess/getHumanMoves.ts`         | `getHumanMoves(fen, ratingBucket)` — used inside expander for `lineHuman` and inside move probability when no player data. |
| **Config constants**           | `src/lib/config.ts`                        | All thresholds and weights (see Part 2).                                                                                   |

### Flow from “Deep analyze” click

1. User clicks **“Deep analyze”** in `NodeActions` → `handleDeepAnalyze()` runs.
2. `POST /api/prep/projects/:id/analyze-node` with `{ fen: currentNode.fen }`.
3. API validates FEN, loads project, enqueues job `{ rootFen: fen, projectId }`, sets node status to `ANALYSIS_RUNNING`, returns `jobId`.
4. Worker runs `processLineAnalysisJob(data)`.
5. When done, node is updated to `ANALYZED_WITH_TRAPS` or `ANALYZED_NO_TRAPS`; UI refetches and shows “View lines”.
6. “View lines” links to `/analyze-position?rootFen=...`; that page fetches `GET /api/line-analysis?rootFen=...` which returns all stored `LineAnalysis` rows for that FEN, ordered by `score` desc.

---

## Part 2 — Pipeline step-by-step (from job start to stored lines)

Constants used below (from `src/lib/config.ts`):

- `LINE_ANALYSIS_DEPTH = 18` (engine depth)
- `LINE_ANALYSIS_MULTIPV = 5`
- `LINE_ANALYSIS_LINE_DEPTH = 6` (half-moves per line)
- `LINE_ANALYSIS_TOP_MOVES = 5`
- `LINE_ANALYSIS_RATING_BUCKET = "1600-1800"`
- `LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY = 0.05`
- `OPPONENT_MIN_MOVE_PROBABILITY = 0.05`
- `OPPONENT_FORCED_BRANCH_THRESHOLD = 0.7`

### Step 1: Job setup

- Normalize root FEN: `normalizeFenForLookup(rootFen)` (castling stripped).
- If `projectId` is set: load project from DB, set `preparerColor` (from `project.color`) and `bucket` (from `project.ratingBucket` or default).
- Build `opponentProfile = { projectId, ratingBucket: bucket, preparerColor }`.

### Step 2: Root candidate moves (processor)

- Call `analyzePosition(rootFenNoCastling, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV)` once.
- Take **top 5 moves by engine eval**: `engineResult.bestMoves.slice(0, LINE_ANALYSIS_TOP_MOVES)`.
- No filtering by opponent likelihood, no “trap” or “forcing” criterion. Purely engine top-5.

### Step 3: Expand lines (one batch per root move)

For **each** of the 5 root moves:

- Call `expandRealisticLines(rootFenNoCastling, firstMove.move, { depth: 6, preparerColor, opponentProfile })`.
- This returns **an array** of `ExpandedLine[]` (one or many, depending on opponent branching).

### Step 4: expandRealisticLines / expandStep (recursive) — pseudocode

```
expandRealisticLines(rootFen, initialMove, options):
  depth = options.depth  // 6
  return expandStep(rootFen, depth, initialMove, isFirstStep=true, lineMoves=[], lineEngine=[], lineHuman=[], opponentProbs=[], opponentDistributions=[], options)

expandStep(currentFen, depthLeft, initialMove, isFirstStep, lineMoves, lineEngine, lineHuman, opponentProbs, opponentDistributionsSoFar, options):
  if depthLeft <= 0:
    entryProbability = product(opponentProbs) or 1
    return [ { lineMoves, lineEngine, lineHuman, opponentProbabilityPerStep, opponentDistributionsPerStep, entryProbability } ]

  fenNorm = normalizeFenForLookup(currentFen)
  opponentTurn = (sideToMove(fenNorm) is opponent of preparerColor)

  if opponentTurn:
    // Fetch in parallel: opponent distribution, engine, human moves
    dist = getOpponentMoveDistribution(fenNorm, opponentProfile)
    engineResult = analyzePosition(fenNorm, depth=18, multipv=5)
    humanResult = getHumanMoves(fenNorm, ratingBucket)

    allowed = dist.moves where probability >= 0.05
    if allowed.length == 0: return [ current line as terminal ]

    forcedMove = allowed.find(p >= 0.7) ?? null
    toExpand = forcedMove ? [forcedMove] : allowed   // if no single move >= 70%, expand ALL allowed moves

    out = []
    for each (oppMove, probability) in toExpand:
      apply oppMove, get nextFen
      nextLines = expandStep(nextFen, depthLeft-1, null, false, lineMoves+[oppMove], ..., opponentProbs+[probability], opponentDistributionsSoFar+[dist.moves], options)
      out.push(...nextLines)
    return out

  else:
    // Preparer's turn
    engineResult = analyzePosition(fenNorm, 18, 5)
    humanResult = getHumanMoves(fenNorm, ratingBucket)

    if isFirstStep and initialMove:
      moveToPlay = engineResult.bestMoves.find(m => m.move === initialMove) ?? engineResult.bestMoves[0]
    else:
      moveToPlay = engineResult.bestMoves[0]   // always engine top move

    if !moveToPlay: return [ current line as terminal ]
    apply moveToPlay, get nextFen
    return expandStep(nextFen, depthLeft-1, null, false, lineMoves+[move], ..., opponentProbs, opponentDistributionsSoFar, options)  // single branch
```

Observations:

- **Preparer’s turn**: Exactly one move is chosen — either the root candidate (`initialMove`) or, at later preparer moves, **always** `engineResult.bestMoves[0]`. No multiPV branching for the preparer.
- **Opponent’s turn**: Moves with probability ≥ 5% are “allowed”. If any move has probability ≥ 70%, only that move is expanded (“forced”); otherwise **every** allowed move is expanded, so we get **multiple lines** from one root candidate.
- **Depth**: Fixed 6 half-moves. No early termination for “obvious trap” or “only move”.
- **Engine**: Called at **every** position (both sides) with depth 18, multiPV 5. Used to pick preparer move (top 1) and to get eval for the chosen opponent move for scoring.

### Step 5: Filter before save (processor)

For each expanded line:

- Skip if `line.lineEngine.length === 0`.
- Skip if `line.entryProbability < LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY` (0.05). So we only drop lines that are very unlikely for the opponent to enter; we do **not** cap how many lines we keep.

### Step 6: Scoring and storage (processor)

For each line that passed the filter:

- `branchingFactor = computeOpponentBranchingFactor(line.opponentDistributionsPerStep)` (sum over opponent steps of `max(0, plausibleCount - 1)`).
- `score = computeLineDifficulty(line.lineEngine, line.lineHuman, { opponentProbabilityProduct: line.entryProbability, opponentBranchingFactor: branchingFactor })`.
- **Every** such line is stored: `prisma.lineAnalysis.create({ rootFen, lineMoves, score, metricsJson })`. There is **no** “keep only top K lines” or “keep only lines with score above X”.

### Step 7: After all root moves

- If `projectId` is set, update `OpeningTreeNode` for this FEN: `analysisStatus`, `trapCount = linesStored.length`, `lastAnalyzedAt`, `lastJobId = null`.

So: **5 root candidates × (multiple branches at each opponent turn)** can produce many lines; all that pass the entry-probability threshold are stored and later shown ordered by score.

---

## Part 3 — Scoring function

**Location:** `src/lib/analysis/metrics.ts` — `computeLineDifficulty(lineEngineData, lineHumanData, options?)`.

### Formula (pseudocode)

```
n = min(len(lineEngineData), len(lineHumanData))
score = 0

for i in 0..n-1:
  eng = lineEngineData[i],  hum = lineHumanData[i]
  margin = (i > 0) ? clamp(eng.eval, -200, 200) : 0
  errorRate = (hum.games > 0) ? (1 - hum.winrate) : 0
  score += margin * 0.1 + errorRate * 50

if options.opponentProbabilityProduct != null:
  score += options.opponentProbabilityProduct * 20
if options.opponentBranchingFactor != null:
  score -= options.opponentBranchingFactor * 10

return round(score * 10) / 10
```

### What is included

- **Per-move (for each half-move in the line):**
  - **Margin term:** `margin * 0.1` where `margin` is the engine eval (centipawns) for that move, clamped to [-200, 200]. For the **first** move (i=0), margin is forced to 0, so the first move does not contribute engine eval to the score.
  - **Error-rate term:** `(1 - winrate) * 50` when `hum.games > 0`; else 0. So “human often loses from this move” adds to the score.
- **Line-level (options):**
  - **Opponent probability:** `entryProbability * 20` (adds to score — more likely lines score higher).
  - **Branching penalty:** `branchingFactor * 10` (subtracted — more opponent options reduce score).

### What is not included (in the pipeline)

- **Move margin (best vs second-best):** `computeMoveMargin()` exists in metrics but is **never called** in the processor or expander. So we do **not** score “only one good move” or “big gap to second best”.
- **Unnatural / only-move score:** `computeUnnaturalScore()` is implemented as a stub that always returns 0 and is not used in scoring.
- **Length penalty:** No penalty for long lines; longer lines simply have more terms in the loop, so they tend to accumulate more `margin*0.1` and `errorRate*50`.
- **Forcing / only-move detection:** No notion of “opponent has only one reasonable move” or “only move to stay in the game”.
- **Trap-specific logic:** No explicit “this is a trap” or “opponent must find only moves” signal.

### What dominates the score

- **Per-move:** `errorRate * 50` can be large (up to 50 per move when winrate ≈ 0). `margin * 0.1` is at most 20 per move (when clamped). So **human error rate (1 - winrate) dominates** the per-move contribution.
- **Line-level:** `entryProbability * 20` can add up to 20; branching penalty subtracts `branchingFactor * 10`. So lines that are “realistic” (high entry prob) and “narrow” (low branching) get a modest bonus; the main driver remains the per-move sum.
- **Length:** More half-moves ⇒ more iterations ⇒ higher total score. So **longer lines tend to score higher** unless they have low entry probability or high branching.

---

## Part 4 — Why the system outputs long, branching, theory-like lines

### 4.1 Long lines

- **Fixed depth:** We always expand exactly `LINE_ANALYSIS_LINE_DEPTH = 6` half-moves. There is no “stop when we’ve found a trap” or “stop when position is decisive.”
- **Score grows with length:** Each half-move adds `margin*0.1 + errorRate*50`. So longer lines accumulate more score and are not penalized for length. Stored lines are sorted by score desc, so longer lines naturally rank high.
- **No maximum line length or “trap depth”:** The algorithm does not prefer short, sharp lines.

### 4.2 Branching

- **Opponent side:** Whenever the opponent has **more than one** move with probability ≥ 5% and **no** move ≥ 70%, we expand **all** such moves. So from a single root candidate we can get many lines (one per opponent choice at each opponent turn). The branching penalty only _reduces_ the score; it does not prevent these lines from being generated or stored.
- **Preparer side:** We always take exactly one move (engine best or the fixed root candidate). So we do not branch on preparer moves, but we do branch fully on opponent moves within the probability threshold.
- **All stored:** Every line that passes the 5% entry-probability threshold is written to the DB. There is no “keep best N lines per root” or “one line per root move.”

Result: The pipeline is designed to produce **many** lines (theory-like breadth) and then rank them by a score that rewards length and human error rate.

### 4.3 Theory-like sequences

- **Engine-driven play:** On preparer’s turn we always play `engineResult.bestMoves[0]` (or the root candidate on the first move). So the preparer’s play is “engine best” at every step — i.e. theoretical best play, not “trap” or “practical” choice.
- **Opponent moves:** Constrained only by “likely enough” (≥ 5%) and “forced” only when one move is ≥ 70%. So we still follow engine-style variety wherever the opponent has several plausible moves.
- **No “surprise” or “trap” bias:** We do not prefer moves that are good but less common in theory, or positions where the opponent is forced. We prefer engine top move + all opponent moves above a low probability bar.

So the content of the lines is “engine best vs likely opponent moves” over a fixed 6 half-moves — which matches theory-like, balanced play rather than short traps.

### 4.4 Non-forcing play

- **No “only move” or “forcing” detection:** We never compute “opponent has only one good move” or “margin between best and second best.” So we do not bias toward forcing positions.
- **Preparer always plays engine best:** We do not choose a move that “forces the opponent into a narrow tree.” We choose the engine’s top move, which in open positions often keeps many options for both sides.
- **Depth 6 regardless of forcing:** Even if the position were forcing, we would still expand 6 half-moves, so we do not stop at the “trap moment.”

Architecturally, the pipeline is built to **enumerate** “engine best + likely opponent replies” to a fixed depth and then **score** by length, human error rate, entry probability, and branching. It is not built to **select** forcing lines or to **stop** when the position becomes a trap.

---

## Part 5 — Top 5 mismatches vs product goal

**Product goal:** Find **“forcing lines where the opponent must find precise moves or go wrong.”**

Based on the code:

1. **No “forcing” or “only move” signal in scoring or selection.**  
   We never measure “opponent has only one good move” or “large eval gap between best and second best.” So we do not prefer positions where the opponent is under pressure to find the only move. The score is driven by engine eval (clamped), human error rate, entry probability, and branching — none of which directly encode “opponent must find precise moves.”

2. **Preparer always plays engine top move.**  
   The algorithm does not choose “trap” or “practical” moves that narrow the opponent’s options. It chooses the engine’s best move at every preparer turn, which tends to keep positions rich and theory-like rather than forcing.

3. **Fixed depth 6 and no early stop at “trap” or “only-move” positions.**  
   We always expand 6 half-moves. We do not stop when the position becomes clearly forcing or when the opponent has only one reasonable move. So we systematically produce full-length lines instead of short, sharp traps.

4. **Score rewards length and human error rate, not “trap quality.”**  
   Longer lines get more terms in the sum (margin + error rate), so they tend to score higher. We do not reward “short sequence to a critical moment” or “few moves where opponent must be precise.” So the ranking favors long, theory-like lines rather than short forcing sequences.

5. **All lines above a low entry-probability bar are stored; no “best traps only” cap.**  
   We only drop lines with entry probability < 5%. We do not keep “top K traps per root” or “only lines above a trap-quality threshold.” So the UI is fed every plausible line we expanded, ordered by a score that favors length and error rate, which again favors long, branching, theory-like content over a small set of clear forcing traps.

---

**Summary:** The current pipeline is an **engine-driven, fixed-depth line enumerator** that (a) picks root candidates by engine top-5, (b) expands preparer moves as engine best and opponent moves as all moves above 5% (or one move if ≥ 70%), (c) scores by per-move eval and human error rate plus entry probability and branching, and (d) stores every line above the entry-probability threshold. It does not measure or optimize for “forcing” or “only move” or “trap,” which explains why the results look like long, branching, theory-like lines that are hard for both sides to memorize and not focused on positions where the opponent must find only moves.

---

## Appendix: Data and capabilities (for trap redesign)

Answers derived from the codebase.

### 1) Engine data availability

**When we call `analyzePosition(fen, depth, multipv)`:**

- **Full multipv list with evals:** **Yes.** The result is `EngineAnalysisResult = { bestMoves: EngineBestMove[] }`. Each `EngineBestMove` has `{ move: string; eval: number; pv: string[] }`. We request `LINE_ANALYSIS_MULTIPV = 5`, and Lichess cloud eval returns `pvs`; we map each PV to `{ move: moves[0], eval: cpFromPv(pv), pv: moves }`. The whole array is stored in Redis and Postgres (`engineJson`). So we have up to 5 moves per position, each with its eval.
- **PV lines or only first move:** **Full PV.** We store `pv: moves` (the full continuation from the API: `pv.moves?.trim().split(/\s+/)`). So we have the full principal variation for each of the multipv lines, not just the first move.
- **Second-best and third-best eval gaps:** **Yes, from stored data.** We have `bestMoves[0].eval`, `bestMoves[1].eval`, etc. So “best vs second-best move margin” is `bestMoves[1].eval - bestMoves[0].eval` (for the side to move). This is exactly what `computeMoveMargin()` in `src/lib/analysis/metrics.ts` computes; it is **not** currently used in the pipeline but the data is available at analysis time. No extra API calls needed.

**Caveat:** Chess-api.com fallback returns only one move (single `bestMoves` entry), so margin would be 0 for those positions.

---

### 2) Evaluation swings (eval before/after move, eval delta)

- **Eval before and after a move:** We call `analyzePosition()` at **every** position along the line (both preparer and opponent turns). So for each half-move we have an engine result for the position **before** that move is played. The `lineEngine` array stores, for each move in the line, the **eval of the move that was played** (the eval of that move in the position before it; i.e. the eval of the resulting position from the perspective of the side that just moved, which is the standard “eval after move” convention). We do **not** explicitly store “eval of the position before the move” as a separate field, but we have it: it is the eval of the **previous** position’s best move (or the position’s eval if we had stored it). So:
  - **Before move:** Available implicitly: the eval at the current position is the eval of the best move we’re about to play (or we could take `engineResult.bestMoves[0].eval` from the analysis we did at that position).
  - **After move:** Stored in `lineEngine[i]` for the move at index `i` — that entry’s `eval` is the eval of the position after the move (from the mover’s perspective; Lichess/engine convention).
- **Eval delta:** For a single move, “eval before” = eval at position P (side to move), “eval after” = eval at position P’ (after the move; perspective flips). So delta = `eval_after - (-eval_before)` if we use same perspective, or we can compute swing in the preparer’s perspective along the line. So **yes**, we can compute “eval before and after” and thus “if opponent goes wrong, eval collapses” — we have the evals at each step in `lineEngine`; we only need to apply the correct perspective (flip for opponent moves) when comparing.

**Summary:** We have per-step evals in `lineEngine`. Eval before/after and eval deltas are computable; perspective (whose eval) must be handled when defining “swing” (e.g. in preparer’s view).

---

### 3) Human move stats granularity (`getHumanMoves`)

**Return type:** `GetHumanMovesResult = { moves: HumanMoveStat[] }` where `HumanMoveStat = { move: string; games: number; winrate: number }`.

- **Frequency per move:** **Yes.** Each entry has `games`. So we get game count per move. Frequency = `games / totalGames` where `totalGames = sum(moves.map(m => m.games))`.
- **Winrate per move:** **Yes.** `winrate` is from the perspective of the side to move (computed as `(wins + draws/2) / games` from the Lichess response).
- **Total games:** Not returned as a separate field, but trivial: `totalGames = moves.reduce((s, m) => s + m.games, 0)`.

So we **can** detect “Opponent plays move A 70%, move B 20%, move C 10%” by computing `games_A / totalGames`, etc. The pipeline already uses this in `getOpponentMoveDistribution()` (which uses Lichess and/or player data and outputs probabilities). So the data and the concept of “move distribution” are already there.

---

### 4) Engine cost constraints

- **API used:** We use **Lichess cloud eval** first: `LICHESS_CLOUD_EVAL_BASE = "https://lichess.org/api/cloud-eval"` with `?fen=...&multiPv=...`. If that fails, we fall back to **chess-api.com** (`CHESS_API_EVAL_BASE`).
- **Rate limit:** Lichess API is rate-limited (429 “too many requests” is known). Docs say only one request at a time and wait at least a minute after 429. Exact limits are not clearly documented; users have reported hitting limits after thousands of requests over a couple of hours. So we should avoid aggressive uncached bursts.
- **Caching:** **Yes, per FEN (and depth, multipv).** Lookup order: (1) Redis key `engine:{normalizedFen}:{depth}:{multipv}`, (2) Postgres `PositionCache` on `(fen, depth, multipv)`, (3) Lichess (or chess-api). On first miss we write to both Redis and Postgres. Redis TTL = `CACHE_ENGINE_TTL = 30 * 86400` (30 days). So repeated analysis of the same position does not hit the API. New positions (e.g. every new branch) do trigger one request per position until cached.

**Implication for trap search:** We can call `analyzePosition` freely for positions we’ve already analyzed (cache hit). For new positions, each call is one Lichess (or fallback) request. So we can be more aggressive with search **within the set of positions we already analyze** (e.g. reusing multipv to compute margins, eval swings) without extra cost. Adding many new positions (e.g. deep trap search) will increase API usage and we should be mindful of rate limits and possibly batching/throttling.

---

### 5) Current line storage (`LineAnalysis.metricsJson`)

**What we store** (from `src/lib/queue/processor.ts`):

```ts
metricsJson: {
  lineEngine: line.lineEngine,   // Array<{ move: string; eval: number }>
  lineHuman: line.lineHuman,     // Array<{ move: string; games: number; winrate: number }>
  entryProbability: line.entryProbability,
  opponentBranchingFactor: branchingFactor,
}
```

- **entryProbability:** **Yes,** stored. Product of opponent move probabilities along the line. Reusable for filtering or scoring; no need to recompute from distributions.
- **branchingFactor (as opponentBranchingFactor):** **Yes,** stored. Sum of (plausible opponent moves - 1) per opponent step. Reusable.
- **Per-move evals:** **Yes,** in `lineEngine`. Each element is `{ move, eval }`. So we have the eval for the move that was played at each step (eval of the position after that move from the mover’s perspective). We do **not** store the full multipv (all 5 evals) per position — only the eval of the move we actually played. So for **stored** lines we cannot recompute “best vs second-best margin” at each step without re-calling the engine (or having stored full multipv in the past). At **analysis time** we do have full multipv; we just don’t persist it in `metricsJson`.

**Reuse vs recompute:**

- **Reuse:** `entryProbability`, `opponentBranchingFactor`, per-move eval of the played move (`lineEngine[].eval`), and human stats per move (`lineHuman`).
- **Recompute (or extend storage):** Best-vs-second-best margin at each position (would need full multipv per position in storage, or re-call engine when evaluating trap quality). Eval “before move” at each step can be derived from adjacent `lineEngine` entries if we account for perspective.

---

## Algorithm audit: logical flaws (diagnosis only)

Re-evaluation of the algorithm in light of available data. No code changes proposed.

---

### Part 1 — The REAL selection objective

**What the algorithm is actually optimizing for**

The pipeline has three stages: (1) which lines are **expanded**, (2) which lines are **kept**, (3) what **score** they get. None of these are tuned for “trap” or “forcing.”

#### 1.1 Signals that decide which lines are expanded

**Root candidates:**

- **Signal:** Engine eval only. We take `engineResult.bestMoves.slice(0, 5)` at the root.
- **Pseudocode:** `topMoves = analyzePosition(rootFen, 18, 5).bestMoves.slice(0, 5)`. No filter by margin, no filter by “opponent likely to allow this,” no filter by “this leads to forcing play.”

**Preparer’s turn (during expansion):**

- **Signal:** Engine best move only. We always play `engineResult.bestMoves[0]` (or the fixed root move on step 0).
- **Pseudocode:** `moveToPlay = isFirstStep && initialMove ? find(initialMove) ?? bestMoves[0] : bestMoves[0]`. No consideration of “does this move force the opponent?” or “is there a big margin here?” We never use multipv to prefer a move that narrows opponent options.

**Opponent’s turn (during expansion):**

- **Signals:** (a) Move probability ≥ 5% (`OPPONENT_MIN_MOVE_PROBABILITY`). (b) If any move has probability ≥ 70% we expand only that move; otherwise we expand **all** moves ≥ 5%.
- **Pseudocode:**  
  `allowed = dist.moves.filter(m => m.probability >= 0.05)`  
  `toExpand = allowed.find(m => m.probability >= 0.7) ? [that] : allowed`  
  Then for each move in `toExpand`, we recurse. So expansion is driven by **opponent likelihood** (so the line is “realistic”), not by “opponent has only one good move” or “other moves collapse eval.”

**Summary for expansion:** We expand “engine top 5 at root × (at each opponent turn, every move the opponent plays with probability ≥ 5%, unless one is ≥ 70%) × (at each preparer turn, exactly engine best).” So we optimize expansion for **realism** (opponent plays likely moves) and **engine correctness** (we play best move). We do **not** expand toward positions where the opponent is forced or where a mistake collapses the position.

#### 1.2 Signals that decide which lines are kept

**Filter (processor, before save):**

- **Signal 1:** `line.lineEngine.length > 0` (line has at least one move).
- **Signal 2:** `line.entryProbability >= LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY` (0.05). So we drop only lines that are very unlikely (opponent would almost never play into them).
- **Pseudocode:**  
  `if (line.lineEngine.length === 0) skip`  
  `if (line.entryProbability < 0.05) skip`  
  `else create LineAnalysis record`

There is **no** filter on: score, length, branching, margin, eval swing, or “trap quality.” Every line that passes the 5% entry-probability bar is stored. So “which lines are kept” is decided by **minimum realism** (entry probability ≥ 5%), not by “is this a trap” or “is this forcing.”

#### 1.3 Signals that decide the final score

**Scoring (computeLineDifficulty):**

- **Per half-move (for each move in the line):**
  - `margin = (i > 0) ? clamp(eng.eval, -200, 200) : 0` — so we use the **eval of the move that was played** (position eval after the move), clamped. This is **not** “best vs second-best margin”; it is raw position eval. First move contributes 0.
  - `errorRate = (hum.games > 0) ? (1 - hum.winrate) : 0` — how often the side to move “loses” from this move (1 − winrate).
  - `score += margin * 0.1 + errorRate * 50`
- **Line-level:**
  - `score += entryProbability * 20`
  - `score -= opponentBranchingFactor * 10`

**Pseudocode:**

```
score = 0
for i in 0..n-1:
  margin = (i > 0) ? clamp(lineEngine[i].eval, -200, 200) : 0
  errorRate = lineHuman[i].games > 0 ? (1 - lineHuman[i].winrate) : 0
  score += margin * 0.1 + errorRate * 50
score += entryProbability * 20
score -= branchingFactor * 10
return round(score, 1)
```

So the **objective** being maximized is: sum over the line of (position eval × 0.1 + human “loss rate” × 50), plus a bonus for high entry probability and a penalty for high branching. That rewards **long lines** (more terms), **positions where the mover’s winrate is low** (error rate high), and **realistic lines** (entry prob). It does **not** reward “big gap between best and second best,” “eval swing after mistake,” or “opponent has only one good move.”

---

### Part 2 — Ignored data

We have the following at analysis time; the table states whether each is **used** or **ignored** and where.

| Capability                                        | Used?                    | Where (or why ignored)                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Best vs second-best move margin**               | **Ignored**              | `computeMoveMargin(engineResult)` exists in `metrics.ts` but is **never called** in the processor or expander. The score uses `eng.eval` (eval of the **played** move), not the gap between best and second best. So we never ask “is there only one good move here?”                                                                                                                                        |
| **Forced move detection (only-move situations)**  | **Ignored**              | We never compute “number of moves above threshold” from the **engine** (e.g. only one move within 50 cp of best). The 70% rule is **opponent frequency** (“opponent plays this 70% of the time”), not “engine says only one move is good.” So we do not detect engine-only-move positions.                                                                                                                   |
| **Eval swing after opponent mistake**             | **Ignored**              | We have evals at each step in `lineEngine`, so we could compute “eval before and after” and “if opponent plays a different move, does eval collapse?” We never do. We never compare eval on our line vs eval on an alternative opponent move. No “punishment for mistake” signal.                                                                                                                            |
| **Whether opponent has multiple plausible moves** | **Used only as penalty** | We compute `opponentBranchingFactor` (count of plausible moves − 1 per opponent step) and **subtract** it from the score. So we penalize “opponent has many options” but we still **expand** all those options (every move ≥ 5%) and store all resulting lines. We do not use “few plausible moves” as a **selection** or **expansion** criterion (e.g. “only expand lines where opponent is forced”).       |
| **Whether preparer moves are forcing**            | **Ignored**              | We never look at the engine multipv at preparer’s position to see if the opponent’s best reply is much better than the rest. We always play engine best; we never ask “does this move leave the opponent with only one good reply?”                                                                                                                                                                          |
| **Opponent mistake likelihood vs best move**      | **Partially used**       | We have move probabilities and we use them to **expand** (only moves ≥ 5%) and to compute **entryProbability**. We do **not** use “probability opponent plays the **best** move” vs “probability they play something else” to score “likelihood of mistake.” The score uses `1 - winrate` for the move that was **played** (how often that move loses), not “how often does the opponent deviate from best?” |
| **Whether line collapses after one mistake**      | **Ignored**              | We never compute “if at step k the opponent plays move B instead of A, eval drops by X.” So we have no “one-mistake collapse” or “critical moment” signal.                                                                                                                                                                                                                                                   |

**Summary:** Best-vs-second-best margin, forced-move detection, eval swing, preparer-forcing, and “line collapses after one mistake” are **not used**. Opponent “multiple plausible moves” is used only as a score penalty; we still expand and store all those branches. Mistake likelihood is only indirectly reflected via winrate of the move played, not “deviation from best move.”

---

### Part 3 — Core design flaws (why we get long, branching, memorization-heavy, non-forcing lines)

**Long lines**

- **Fixed depth:** We always expand exactly `LINE_ANALYSIS_LINE_DEPTH = 6` half-moves. There is no early exit when “we’ve reached a trap” or “opponent has only one move.” So every line is 6 half-moves by construction.
- **Score structure:** The score is a **sum** over each half-move. So longer lines (more moves) add more terms. We do not penalize length or reward “short sequence to critical moment.” So the **objective** favors longer lines.
- **Architectural reason:** The expansion step terminates only when `depthLeft <= 0`. There is no “trap detected, stop” condition. So the design is “fixed-length enumeration,” not “search until trap or forcing moment.”

**Branching lines**

- **Opponent expansion rule:** At each opponent turn we expand **every** move with probability ≥ 5%, unless one move has probability ≥ 70%. So if the opponent has 3 moves at 40%, 35%, 25%, we expand **all three** and create 3 separate lines. The **expansion** rule is “expand all likely moves,” not “expand only the best move” or “expand only moves that keep the position forcing.”
- **No cap on stored lines:** Every expanded line that passes the 5% entry-probability filter is stored. We do not keep “top K per root” or “only lines with score above trap threshold.” So the **storage** rule preserves all branches.
- **Architectural reason:** The design treats “opponent has several plausible moves” as “create one line per plausible move.” Branching factor is only used to **penalize** the score; it does not **prune** expansion or storage. So the algorithm is built to **enumerate** branches, not to **select** narrow, forcing branches.

**Memorization-heavy lines**

- **Preparer always plays engine best:** At every preparer turn we play `engineResult.bestMoves[0]`. So the preparer’s side is “theory best.” In open positions that usually means many reasonable moves for both sides; the line is “main line theory,” which is memorization-heavy.
- **No “surprise” or “practical” move:** We never choose a move that is good but not top engine (e.g. a trap that is slightly worse but forces the opponent to find only moves). So we never produce “short, sharp, practical” lines.
- **Architectural reason:** The preparer move is chosen by a single rule: engine best (or root candidate). There is no “trap move” or “forcing move” selector. So the content is theory-heavy by construction.

**Non-forcing play**

- **No margin-based selection:** We never use “best vs second-best margin” to decide what to expand or what to score. So we never prefer positions where the opponent has only one good move.
- **No “only move” detection:** We never compute “number of moves within X cp of best.” So we never identify “opponent must find the only move” and bias the pipeline toward those positions.
- **Preparer move choice:** We never ask “does this preparer move force the opponent into a narrow tree?” So we never select **forcing** preparer moves.
- **Architectural reason:** Forcing is a function of **engine multipv** (margin, only-move situations). The pipeline uses multipv only to get **one** move (the best) for the preparer and to get **eval** for the move played. It never uses the **rest** of the multipv (second-best eval, etc.) to measure or prefer forcing. So the design has no “forcing” signal at all.

---

### Part 4 — Implicit “good line” definition vs product goal

**What the code implicitly treats as a “good line”**

From the expansion, filter, and scoring logic, the algorithm effectively defines a good line as:

1. **Realistic:** The opponent’s moves along the line have probability ≥ 5% each, and the product (entry probability) is ≥ 5%. So “the opponent might play this.”
2. **Engine-correct:** The preparer plays the engine’s best move at every turn. So “we play theory.”
3. **High cumulative “difficulty”:** The score is the sum over the line of (eval × 0.1 + (1 − winrate) × 50), plus entry-probability bonus and branching penalty. So “the line has many positions where the side to move doesn’t win often, and the position eval is moderate.” That is interpreted as “hard for humans” in a generic sense.
4. **Prefer narrow opponent choice only weakly:** We penalize high branching (many opponent options) by subtracting `branchingFactor * 10`, but we still expand and store all those branches. So “narrow” is a small score tweak, not a selection criterion.

So the **implicit definition** is: _“A good line is a realistic, engine-correct sequence of fixed length (6 half-moves) that scores highly on cumulative position eval and human error rate, and is not too branched.”_ There is no notion of “trap,” “forcing,” “only move,” or “collapse after one mistake.”

**Product goal**

- **Goal:** _“A line where the opponent is likely to deviate and the position becomes winning.”_

**Mismatch**

- **Likely to deviate:** We have opponent move distribution (frequency) and could define “likely to deviate” as “opponent often plays something other than the best move.” The pipeline does **not** use “probability opponent plays best move” vs “probability they play something else” to select or score lines. It uses entry probability (how likely they are to **enter** the line) and winrate of the move **played**. So we do not optimize for “opponent is likely to deviate **from** this line.”
- **Position becomes winning:** We have evals at every step and could compute “after a mistake, eval swings in our favor.” We never do. We never measure “eval swing if opponent plays a suboptimal move” or “position becomes winning for us after one inaccuracy.” So we do not optimize for “the position **becomes** winning (after deviation).”

So the algorithm optimizes for **realism + engine correctness + generic human error rate over a fixed length**, while the goal is **deviation likelihood + position becomes winning**. The former does not imply the latter; the pipeline has no signal that ties “good line” to “trap” or “winning after mistake.”

---

### Part 5 — Five most critical algorithm mistakes (diagnosis only)

Ranked by impact on producing non-trap, long, branching, non-forcing lines.

**1. No use of best-vs-second-best margin anywhere**

We have full multipv at every position and could compute “only one good move” or “big gap to second best.” We never do. So we never prefer positions where the opponent is **forced** (only one good move) and never penalize positions where the opponent has many good moves from the **engine’s** perspective. The only “narrow” signal we use is opponent **frequency** (70% rule), which is “opponent often plays this,” not “engine says only this move holds.” So the pipeline is blind to the main engine-based forcing signal.

**2. Preparer always plays engine best move**

We never choose a preparer move that is “slightly worse but forcing” or “trap.” We always play `bestMoves[0]`. So we systematically produce theory lines, not practical traps. Combined with fixed depth, this guarantees long, theory-like sequences.

**3. Fixed depth with no early stop at “trap” or “critical moment”**

We always expand exactly 6 half-moves. We never stop when “opponent has only one move” or “eval would collapse if opponent deviates.” So we cannot produce short, sharp traps by design; every line is 6 half-moves, and we never use “trap detected” as a stopping condition.

**4. Expansion and storage keep every branch above 5% probability**

At opponent turns we expand **all** moves with probability ≥ 5% (unless one is ≥ 70%). Then we **store** every resulting line that has entry probability ≥ 5%. So we explicitly **create and keep** every plausible branch. We do not select “best trap” or “most forcing branch”; we enumerate. So the output is inherently branching, and the “trap count” is just “number of lines we stored,” not “number of traps.”

**5. Score rewards length and generic “error rate,” not “winning after deviation”**

The score is a sum over half-moves of (eval × 0.1 + (1 − winrate) × 50). So longer lines score higher (more terms), and we reward “the move played has low winrate for the mover.” We do **not** reward “if the opponent deviates, our eval jumps” or “this position is winning for us after one mistake.” So the ranking favors long, “difficult” theory lines, not short sequences where the position becomes winning after a likely deviation. The objective and the product goal are misaligned.
