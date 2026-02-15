# Trap-oriented line generation — algorithm design

Design for a new pipeline that optimizes for **forcing lines where the opponent is likely to go wrong and the position becomes winning**. Uses only data we already have at analysis time. This document is the specification for implementation.

**Product definition of a practical trap:**

1. Opponent is likely to enter the position
2. Opponent is likely to play a suboptimal move
3. If they do, the position becomes clearly winning
4. Our moves are forcing
5. The trap happens early, not after long theory

---

## Part 1 — Trap metrics (formulas)

All formulas use data available at analysis time: `analyzePosition(fen, depth, 5)` → `bestMoves[]` with `{ move, eval, pv }`, and opponent move distribution (probabilities per move from player/Lichess/blend).

**Conventions:**

- Eval is in centipawns (cp). Positive = good for side to move. When we say “our” perspective we mean the preparer’s; flip sign for opponent’s moves when comparing.
- `bestMoves` is sorted by eval (best first). `bestMoves[0]` = best move, `bestMoves[1]` = second best, etc.
- At a position, “side to move” is either preparer or opponent. Margin and “best move” are defined for the side to move at that position.

---

### 1.1 Engine forcing score

**Goal:** Detect only-move situations, narrow reply trees, and forcing preparer moves.

**1.1.1 Best vs second-best margin (at a position)**

- **Input:** `engineResult.bestMoves` at position P (side to move).
- **Formula:**  
  `margin_cp(P) = (bestMoves.length >= 2) ? (bestMoves[1].eval - bestMoves[0].eval) : MARGIN_ONLY_MOVE`  
  where `MARGIN_ONLY_MOVE` is a large constant (e.g. 500) meaning “only one move given.”
- **Interpretation:** Large positive margin ⇒ second-best is much worse ⇒ position is “only-move” or narrow for the side to move. We use this for **opponent** positions to detect “opponent must find the only move.”

**1.1.2 Number of moves within X cp of best**

- **Input:** `engineResult.bestMoves`, threshold `X` (e.g. 50 cp).
- **Formula:**  
  `n_near_best(P, X) = |{ i : bestMoves[i].eval >= bestMoves[0].eval - X }|`  
  (count moves whose eval is within X cp of the best).
- **Interpretation:** `n_near_best == 1` ⇒ only-move situation. `n_near_best` small ⇒ narrow tree. We can define **narrowness** as:  
  `narrowness(P, X) = 1 / n_near_best(P, X)` (1 when only move, smaller when many options).

**1.1.3 Reply narrowing after preparer move (forcing preparer move)**

- **Input:** Position P (preparer to move), engine result at P, engine result at Q = position after preparer’s move (opponent to move).
- **Formula:**
  - At P: `margin_preparer = bestMoves[1].eval - bestMoves[0].eval` (margin for preparer’s move choice).
  - At Q: `margin_opponent = bestMoves_opp[1].eval - bestMoves_opp[0].eval` (margin for opponent’s reply).
  - **Reply narrowing:** `reply_narrowing = margin_opponent` (how much the opponent is forced at Q).
  - **Forcing preparer score:** We want preparer to play a move such that at Q the opponent has a big margin (only one good reply). So we use `margin_opponent` at the position **after** the preparer move as the “forcing preparer move” signal. Optionally combine with `n_near_best(Q, X)`: e.g. `forcing_preparer(P→Q) = margin_opponent(Q) * narrowness(Q, X)`.

**Summary — engine forcing metrics we will compute:**

| Metric                                   | Formula                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `margin_cp(pos)`                         | `bestMoves[1].eval - bestMoves[0].eval` (or constant if single move)            |
| `n_near_best(pos, X)`                    | Count of moves with eval ≥ bestEval - X                                         |
| `narrowness(pos, X)`                     | `1 / n_near_best(pos, X)`                                                       |
| `forcing_after_preparer_move(pos_after)` | `margin_cp(pos_after)` or `margin_cp * narrowness` at opponent-to-move position |

**Config:** `MARGIN_NEAR_BEST_CP = 50` (moves within 50 cp count as “plausible”). `ONLY_MOVE_MARGIN_DEFAULT = 500` when only one move in multipv.

---

### 1.2 Opponent mistake likelihood score

**Goal:** Detect “opponent rarely plays engine best” and “opponent frequently plays worse moves.”

**Input:** At a position (opponent to move), we have:

- `engineResult.bestMoves` → best move = `bestMoves[0].move`, evals for all.
- Opponent move distribution: `dist.moves[]` with `{ move, probability }` (from `getOpponentMoveDistribution`).

**1.2.1 Probability opponent plays best move**

- **Formula:**  
  `p_best = probability of bestMoves[0].move in dist`  
  If the best move (UCI) is in the distribution, use its probability; else `p_best = 0`.
- **Interpretation:** Low `p_best` ⇒ opponent often deviates from engine best.

**1.2.2 Probability opponent deviates**

- **Formula:**  
  `p_deviate = 1 - p_best`.
- **Interpretation:** High `p_deviate` ⇒ opponent is likely to play a non-best move (mistake likelihood).

**1.2.3 Weighted expected mistake probability (severity-weighted)**

- We want “opponent deviates **and** the move is bad.” So we weight each move by how much worse it is than best.
- **Formula:**  
  For each move `m` in distribution with probability `p_m` and engine eval `eval(m)` (from multipv; if not in multipv, use a default worse eval, e.g. `bestEval - 100`):  
  `mistake_weight(m) = max(0, bestEval - eval(m))` (cp drop if they play this move).  
  `expected_mistake_score = sum over m of (p_m * mistake_weight(m))`.  
  Normalize optionally: e.g. divide by 100 to get a “cp-weighted mistake likelihood” in a nice range.
- **Interpretation:** High value ⇒ opponent often plays moves that lose cp; combines “they deviate” and “when they do, it hurts.”

**Summary — mistake likelihood metrics:**

| Metric                     | Formula                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `p_best(pos)`              | Probability of `bestMoves[0].move` in opponent distribution                                                      |
| `p_deviate(pos)`           | `1 - p_best(pos)`                                                                                                |
| `expected_mistake_cp(pos)` | `sum_m p_m * max(0, eval(best) - eval(m))` (opponent’s side: so worse move = lower eval; we want drop from best) |

Note: Eval at position is from opponent’s perspective; “best” is their best move. So `eval(best)` is the best they can do; for any other move `m`, `eval(m) <= eval(best)`. So `eval(best) - eval(m)` is the cp drop when they play `m`.

---

### 1.3 Punishment score (“if opponent deviates, eval collapses”)

**Goal:** Detect “after a mistake, the position becomes clearly winning for us.”

**Input:** Position P (opponent to move). We have multipv at P (opponent’s moves and evals). We have our eval at the position (from our perspective): e.g. `our_eval_before = -opponent_best_eval` (flip because it’s opponent to move). After opponent plays move `m`, we have position Q; we get eval at Q (preparer to move) = `our_eval_after(m)`.

**1.3.1 Eval drop after non-best move (for a single move m)**

- **Formula:**  
  At P, opponent’s best move gives position Q_best; our eval there = `E_best` (preparer perspective).  
  If opponent plays move `m` ≠ best, we get position Q_m; our eval there = `E_m`.  
  **Eval drop (for us) when they play m:** `drop_m = E_m - E_best` (we gain when they play m; so E_m > E_best when m is worse for them). In opponent’s eval terms: their eval after best is `V_best`, after m is `V_m`; we have `our_eval = -their_eval`, so `drop_m = -V_m - (-V_best) = V_best - V_m`. So **eval drop when opponent plays m** = `eval(best) - eval(m)` in opponent’s multipv (their eval gets worse = our eval gets better).
- So we already have this: for each move in multipv, `eval(best) - eval(m)` is the cp gain for us when they play m instead of best.

**1.3.2 Expected eval swing (probability-weighted)**

- **Formula:**  
  `expected_eval_swing = sum over m of (p_m * (eval(best) - eval(m)))`  
  where `eval(m)` is opponent’s eval after move m (from multipv), and we only sum over m that are worse than best (or all m, with max(0, ...)).  
  So: `expected_eval_swing = sum_m p_m * max(0, eval(best) - eval(m))` (same as `expected_mistake_cp` but we now interpret it as “expected cp gain when opponent deviates”).
- **Interpretation:** High value ⇒ when opponent plays according to their distribution, we expect a big eval gain (they often play worse than best).

**1.3.3 Winning threshold detection**

- **Formula:**  
  After opponent’s move, we have position Q (preparer to move). We say “position becomes clearly winning” if our eval at Q is above a threshold: `our_eval_after >= WINNING_CP` (e.g. 200 cp or 2 pawns).  
  For each opponent move `m`, define `is_winning_after(m) = (our_eval_after(m) >= WINNING_CP)`.  
  **Punishment score (binary):** At this position, does **any** plausible opponent move (e.g. prob ≥ 5%) lead to a winning position for us?  
  `any_plausible_mistake_winning = (exists m in dist with p_m >= 0.05 and our_eval_after(m) >= WINNING_CP)`.  
  **Probability we get a winning position:** `p_winning_after_mistake = sum over m where our_eval_after(m) >= WINNING_CP of p_m`.
- **Interpretation:** Trap is strong if when opponent deviates (with reasonable probability) we reach a winning position. So we want `p_winning_after_mistake` or `expected_eval_swing` high, and we want at least one plausible mistake to cross `WINNING_CP`.

**Summary — punishment metrics:**

| Metric                               | Formula                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `eval_drop_m(m)`                     | `eval(best) - eval(m)` (opponent’s eval; drop for them = gain for us)                  |
| `expected_eval_swing(pos)`           | `sum_m p_m * max(0, eval(best) - eval(m))`                                             |
| `our_eval_after(m)`                  | Eval at position after opponent plays m (preparer’s perspective; flip opponent’s eval) |
| `p_winning_after_mistake(pos)`       | `sum_{m : our_eval_after(m) >= WINNING_CP} p_m`                                        |
| `any_plausible_mistake_winning(pos)` | `exists m with p_m >= 0.05 and our_eval_after(m) >= WINNING_CP`                        |

**Config:** `WINNING_CP = 200` (2 pawns).

---

### 1.4 Line length / critical moment score

**Goal:** Prefer short traps; penalize long theory before the trap.

**1.4.1 Half-move length**

- **Formula:** `line_length = number of half-moves in the line` (length of `lineMoves`).
- **Interpretation:** Shorter ⇒ less to memorize; we will reward shortness.

**1.4.2 Critical move index (where the trap occurs)**

- **Definition:** The “critical move” is the first **opponent** move in the line where:
  - (a) Opponent has a large best-vs-second-best margin (they are forced), and
  - (b) If they play a plausible non-best move, our eval becomes winning (or at least big swing).  
    So we need to scan the line for the first opponent turn where e.g. `margin_cp >= CRITICAL_MARGIN` and `expected_eval_swing >= CRITICAL_SWING` (or `p_winning_after_mistake >= CRITICAL_P`).
- **Formula:**  
  `critical_index = min { i : i is an opponent half-move and margin_cp(pos_i) >= M1 and (expected_eval_swing(pos_i) >= M2 or p_winning_after_mistake(pos_i) >= M3) }`  
  If no such index, `critical_index = null` (no trap detected in this line).
- **Interpretation:** The trap “happens” at this half-move. We want this index to be **small** (early in the line).

**1.4.3 Early trap bonus**

- **Formula:**  
  If `critical_index === null`: `early_bonus = 0`.  
  Else: `early_bonus = max(0, EARLY_BONUS_MAX - k * critical_index)` (linear decay with critical index), or `early_bonus = 1 / (1 + critical_index)` (inverse).  
  So the earlier the critical move, the higher the bonus.
- **Config:** e.g. `EARLY_BONUS_MAX = 50`, `k = 5`, so bonus = 50 at index 0, 45 at 1, …, 0 at index 10.

**1.4.4 Penalty for long sequence before trap**

- **Formula:**  
  If `critical_index === null`: we might treat the whole line as “no trap” and score low or discard.  
  If trap at `critical_index`: `length_penalty = penalty_per_halfmove * critical_index` (we want to penalize theory before the trap). So total “theory before trap” = `critical_index` half-moves; multiply by a constant.
- **Alternative:** Penalty on total length: `length_penalty = penalty_per_halfmove * line_length`. So shorter lines get lower penalty.

**Summary — length / critical moment:**

| Metric           | Formula                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `line_length`    | `len(lineMoves)`                                                                                 |
| `critical_index` | First opponent half-move index where margin and punishment conditions hold (see above)           |
| `early_bonus`    | Decreasing function of `critical_index` (e.g. `50 - 5*critical_index` or `1/(1+critical_index)`) |
| `length_penalty` | `k * line_length` or `k * critical_index`                                                        |

**Config:** `CRITICAL_MARGIN_CP = 80`, `CRITICAL_SWING_CP = 80`, `CRITICAL_P_WINNING = 0.10`. `PENALTY_PER_HALFMOVE = 5`.

---

## Part 2 — Redesign of the search algorithm

### Step A — Root move selection

**Goal:** Choose preparer candidate moves at the root that **could** lead to traps, not only engine best.

**Pseudocode:**

```
function selectRootCandidates(rootFen, opponentProfile, maxCandidates = 5):
  engineResult = analyzePosition(rootFen, DEPTH, MULTIPV)
  dist = getOpponentMoveDistribution(rootFen, opponentProfile)  // if root is opponent to move; else skip
  candidates = []

  for each move m in engineResult.bestMoves (up to MULTIPV):
    // Optional: compute "trap potential" after this move
    nextFen = apply(rootFen, m)
    nextEngine = analyzePosition(nextFen, DEPTH, MULTIPV)
    margin_opponent = margin_cp(nextEngine)  // how forced is opponent after our move?
    expected_swing = expected_eval_swing(nextFen, nextEngine, getOpponentMoveDistribution(nextFen, opponentProfile))

    trap_potential = f(margin_opponent, expected_swing)  // e.g. weighted sum
    candidates.push({ move: m, eval: m.eval, trap_potential })

  // Sort by trap potential (desc) or by weighted combo (eval + trap_potential)
  sort candidates by (trap_potential * W1 + eval_normalized * W2) desc
  return candidates.slice(0, maxCandidates).map(c => c.move)
```

**Key change:** Root candidates are no longer “engine top 5 by eval only.” They are “engine moves ranked by trap potential at the next move (opponent forced? big expected swing?).” So we may prefer a slightly worse engine move that creates a forcing trap over the absolute best move that keeps the position balanced.

**Config:** `ROOT_CANDIDATES_MAX = 5`. We can still cap at 5 but reorder by trap potential. Optionally filter: only consider moves within `ROOT_EVAL_TOLERANCE_CP` of best (e.g. 50 cp) so we don’t suggest bad moves.

---

### Step B — Trap-oriented expansion

**Goal:** Expand until we find a trap, or the line becomes non-forcing, or we hit a depth cap. No fixed depth.

**Pseudocode:**

```
function expandTrapOriented(rootFen, initialMove, preparerColor, opponentProfile):
  return expandStep(rootFen, depthLeft = MAX_DEPTH, initialMove, isFirstStep = true, lineState, options)

function expandStep(currentFen, depthLeft, initialMove, isFirstStep, lineState, options) -> list of lines:
  lineState = { lineMoves, lineEngine, lineHuman, opponentProbs, opponentDists, ... }

  if depthLeft <= 0:
    return [ terminalLine(lineState) ]

  fenNorm = normalizeFen(currentFen)
  opponentTurn = isOpponentTurn(fenNorm, preparerColor)

  if opponentTurn:
    dist = getOpponentMoveDistribution(fenNorm, opponentProfile)
    engineResult = analyzePosition(fenNorm, DEPTH, MULTIPV)

    margin = margin_cp(engineResult)
    expected_swing = expected_eval_swing_from_multipv_and_dist(engineResult, dist)
    p_winning = p_winning_after_mistake(engineResult, dist)

    // TRAP DETECTION (see Step C)
    if isTrapNode(margin, expected_swing, p_winning, dist):
      // Record this as the critical index and terminate this branch with a “trap line”
      return [ terminalLine(lineState, criticalIndex = length(lineState.lineMoves)) ]

    // Otherwise: which opponent moves do we expand?
    allowed = dist.moves.filter(m => m.probability >= MIN_OPPONENT_PROB)
    if allowed.length == 0:
      return [ terminalLine(lineState) ]

    forced_move = allowed.find(m => m.probability >= FORCED_THRESHOLD)
    toExpand = forced_move ? [forced_move] : allowed

    // Optional: further filter toExpand to “moves that are mistakes” (eval drop) to reduce branching
    // toExpand = toExpand.filter(m => eval_drop(m) >= MIN_PUNISHMENT_CP)  // only expand moves that hurt them
    out = []
    for each move in toExpand:
      nextFen = apply(fenNorm, move)
      nextLines = expandStep(nextFen, depthLeft - 1, null, false, lineState.append(move), options)
      out.push(...nextLines)
    return out

  else:
    // Preparer’s turn
    engineResult = analyzePosition(fenNorm, DEPTH, MULTIPV)
    moveToPlay = choosePreparerMove(engineResult, initialMove, isFirstStep, lineState, options)
    if !moveToPlay:
      return [ terminalLine(lineState) ]
    nextFen = apply(fenNorm, moveToPlay)
    return expandStep(nextFen, depthLeft - 1, null, false, lineState.append(moveToPlay), options)
```

**Key changes:**

- **Early termination:** When at an opponent node we detect “trap” (Step C), we **stop** and return the line with that node as the critical (trap) point. We do not keep expanding to fixed depth.
- **Depth cap:** We still have `MAX_DEPTH` (e.g. 10 or 12 half-moves) to avoid infinite expansion.
- **Optional:** Filter opponent moves to expand only those that are “mistakes” (eval drop above threshold) to reduce branching and focus on trap branches.

---

### Step C — Trap detection

**Definition:** At a **node** (position), we say “this line contains a trap at this node” if the following conditions hold. The node must be an **opponent-to-move** position.

**Conditions (all must hold):**

1. **Forcing:** Opponent has a narrow reply set.  
   `margin_cp(engineResult) >= TRAP_MARGIN_CP` (e.g. 80 cp). So the second-best move is significantly worse.  
   Optionally: `n_near_best(pos, 50) <= 2` (at most 2 moves within 50 cp of best).

2. **Mistake likelihood:** Opponent often deviates.  
   `p_deviate >= TRAP_P_DEVIATE` (e.g. 0.20). So at least 20% of the time they don’t play the best move.

3. **Punishment:** When they deviate, we gain a lot.  
   Either:
   - `expected_eval_swing >= TRAP_SWING_CP` (e.g. 80 cp), or
   - `p_winning_after_mistake >= TRAP_P_WINNING` (e.g. 0.10). So with at least 10% probability they play a move that gives us a winning position.

4. **Entry probability (path):** The probability that the opponent has played into this position so far is above a minimum (e.g. we already have `entryProbability` along the path; require `entryProbability >= MIN_ENTRY_PROB`).

**Pseudocode:**

```
function isTrapNode(engineResult, dist, entryProbabilitySoFar):
  if entryProbabilitySoFar < MIN_ENTRY_PROB: return false
  margin = margin_cp(engineResult)
  if margin < TRAP_MARGIN_CP: return false
  p_best = prob_of_move(dist, engineResult.bestMoves[0].move)
  p_deviate = 1 - p_best
  if p_deviate < TRAP_P_DEVIATE: return false
  expected_swing = expected_eval_swing(engineResult, dist)
  p_winning = p_winning_after_mistake(engineResult, dist)
  if expected_swing >= TRAP_SWING_CP or p_winning >= TRAP_P_WINNING:
    return true
  return false
```

**Config:** `TRAP_MARGIN_CP = 80`, `TRAP_P_DEVIATE = 0.20`, `TRAP_SWING_CP = 80`, `TRAP_P_WINNING = 0.10`, `MIN_ENTRY_PROB = 0.05`.

---

### Step D — Line termination

We stop expanding when **any** of the following holds:

1. **Trap found:** `isTrapNode(...)` is true at the current (opponent) node → terminate and record line with `criticalIndex = current length`.
2. **Depth cap:** `depthLeft <= 0` → terminate and return current line (no trap flag, or `criticalIndex = null`).
3. **Line becomes non-forcing (optional):** At an opponent node, if `margin_cp < NON_FORCING_MARGIN` (e.g. 30 cp) and we have already passed a minimum length (e.g. 2 half-moves), we could terminate to avoid long theory. So “stop when opponent has many good moves.”
4. **Opponent has many safe moves (optional):** `n_near_best(pos, 50) > 3` and we are past depth 4 → terminate.
5. **No legal moves / no allowed moves:** Opponent has no moves above minimum probability → terminate.

**Pseudocode:**

```
function shouldTerminate(currentFen, depthLeft, lineState, engineResult, dist, opponentTurn):
  if depthLeft <= 0: return true
  if opponentTurn and isTrapNode(engineResult, dist, lineState.entryProbability): return true  // trap found
  if opponentTurn and margin_cp(engineResult) < NON_FORCING_MARGIN and len(lineState.lineMoves) >= MIN_LENGTH: return true  // optional
  if opponentTurn and n_near_best(engineResult, 50) > 3 and len(lineState.lineMoves) >= 4: return true  // optional
  return false
```

**Config:** `MAX_DEPTH = 12`, `NON_FORCING_MARGIN = 30`, `MIN_LENGTH = 2`.

---

## Part 3 — New scoring function

**Goal:** Rank lines so that the best **traps** score highest. Combine: forcing, mistake likelihood, punishment, entry probability, shortness.

**Proposed formula:**

```
trap_score = 0

// 1) Entry probability (we want opponent to enter the line)
trap_score += W_ENTRY * entryProbability

// 2) Forcing at critical point (if we have a critical index)
if criticalIndex !== null:
  trap_score += W_FORCING * margin_cp_at_critical
  trap_score += W_EARLY * early_bonus(criticalIndex)

// 3) Mistake likelihood at critical point
if criticalIndex !== null:
  trap_score += W_MISTAKE * p_deviate_at_critical
  trap_score += W_EXPECTED_MISTAKE * (expected_mistake_cp_at_critical / 100)

// 4) Punishment at critical point
if criticalIndex !== null:
  trap_score += W_SWING * (expected_eval_swing_at_critical / 100)
  trap_score += W_P_WINNING * p_winning_after_mistake_at_critical

// 5) Shortness
trap_score -= W_LENGTH_PENALTY * line_length
// or: trap_score += W_EARLY * early_bonus (already above)

// 6) Branching (optional: penalize lines that had many opponent options before trap)
trap_score -= W_BRANCHING * opponent_branching_factor_before_critical
```

**Weights (example; tunable in config):**

- `W_ENTRY = 30`
- `W_FORCING = 0.5` (margin in cp, so 80 cp → 40)
- `W_EARLY = 20` (early_bonus in 0..50 range)
- `W_MISTAKE = 25` (p_deviate 0..1)
- `W_EXPECTED_MISTAKE = 0.2` (expected_mistake_cp/100)
- `W_SWING = 0.3` (expected_eval_swing/100)
- `W_P_WINNING = 40` (p_winning 0..1)
- `W_LENGTH_PENALTY = 3` (per half-move)
- `W_BRANCHING = 5`

**Lines with no trap (`criticalIndex === null`):** Either score them low (only entry and length terms) or **do not store them** (only store lines that have a detected trap). Prefer: **only store lines where `criticalIndex !== null`** so we only show traps.

**Normalization:** All terms can be scaled so the final score is in a convenient range (e.g. 0–200). Round to 1 decimal for storage.

---

## Part 4 — Expected behavior (why outputs change)

**1) Why lines will become shorter**

- **Termination on trap:** As soon as we hit a node that satisfies `isTrapNode`, we stop. We do not continue to a fixed 6 half-moves. So lines that contain a trap will end at the critical move (or shortly after), yielding length ≤ critical index + 1 (or + a few if we add our reply).
- **Termination on non-forcing:** Optional early stop when `margin_cp` is small and we’re past minimum length prevents long “theory” tails.
- **Score penalty for length:** `W_LENGTH_PENALTY * line_length` makes shorter lines with the same trap quality score higher. So among two lines with the same trap strength, the shorter one wins.

**2) Why they will become forcing**

- **Root selection:** We rank root moves by trap potential (forcing at next move, expected swing). So we prefer moves that create immediate pressure.
- **Trap condition:** We only label “trap” when `margin_cp >= TRAP_MARGIN_CP`, so the critical position is one where the opponent has a narrow reply set (only-move or near only-move).
- **Storage filter:** If we only store lines with `criticalIndex !== null`, every stored line has at least one such forcing moment. The score then further rewards higher `margin_cp_at_critical` and early occurrence.

**3) Why they will become trap-like**

- **Definition of “trap” in code:** A node is a trap node iff (forcing + mistake likelihood + punishment) all pass. So stored lines are by construction lines that contain at least one such node.
- **Scoring rewards trap strength:** We add terms for `p_deviate`, `expected_eval_swing`, `p_winning_after_mistake` at the critical point. So higher “opponent goes wrong and we win” leads to higher score.
- **No storage of non-traps (recommended):** By storing only lines with a detected trap, the UI will show only trap-like lines, not long theory.

**4) Why branching will decrease**

- **One line per trap:** When we hit a trap node we terminate that branch and return **one** line (the path from root to that node). We do not then expand all other opponent moves at that node into separate lines. So we get one line per “way to reach this trap.”
- **Optional mistake-only expansion:** If we restrict opponent expansion to moves that are “mistakes” (eval drop above threshold), we expand fewer branches at each opponent turn. So we generate fewer lines overall and focus on branches where they go wrong.
- **Root candidates:** We still have multiple root candidates (e.g. 5), but each root move can yield at most one “trap line” per path (the first trap we hit). So total lines ≈ number of (root candidate × path to first trap), which is smaller than “all paths of length 6.”

---

## Implementation checklist (for next phase)

- [ ] Add config constants for all thresholds and weights above.
- [ ] Implement metric helpers: `margin_cp`, `n_near_best`, `narrowness`, `expected_eval_swing`, `p_winning_after_mistake`, `p_deviate`, `early_bonus`, etc., in a new module (e.g. `trapMetrics.ts`).
- [ ] Implement `isTrapNode(engineResult, dist, entryProbability)`.
- [ ] Implement `selectRootCandidates` with trap potential.
- [ ] Replace fixed-depth expansion with trap-oriented expansion (terminate on trap or conditions in Step D).
- [ ] Compute and store `criticalIndex` (and optionally full trap metrics at critical node) per line.
- [ ] Implement new `computeTrapScore` and use it when storing lines.
- [ ] Optionally: only store lines with `criticalIndex !== null`.
- [ ] Add tests for trap detection and scoring on synthetic positions.
