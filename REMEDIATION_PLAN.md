# LLM Chess — Remediation Plan

**Date:** 2026-03-10
**Source:** [CODE_REVIEW.md](./CODE_REVIEW.md)
**Philosophy:** Fix trust-breakers first, then lifecycle leaks, then extract shared modules, then polish. No 65-bug stampede.

---

## Wave 0 (P0) — Benchmark Correctness & Game Truth

These bugs poison every downstream report, replay, and training artifact. Fix first.

---

### 0.1 Infinite LLM retry loop

| | |
|---|---|
| **File** | `src/engine/runtime.ts` ~line 480 |
| **Bug** | `while (!this.aborted)` loop increments `moveAttempt` but never checks `effectivePlayer.maxRetries`. Infinite retries on persistent illegal moves. |
| **Fix** | Add `if (moveAttempt >= effectivePlayer.maxRetries)` guard inside the loop. On breach, emit `GameEnded` with `reason: 'illegal_move_limit'` and `break`. |
| **Test** | Unit test: mock LLM returning illegal moves N+1 times. Assert game ends after N retries with correct reason. |
| **Regression risk** | Low. Currently infinite → now bounded. Games that previously hung will now terminate cleanly. |
| **Behavior change** | Yes — games now end instead of looping forever. This is the correct behavior. |

---

### 0.2 `isCheckmate` hardcoded `false`

| | |
|---|---|
| **File** | `src/engine/runtime.ts` lines 264, 322, 388, 470, 678 |
| **Bug** | Every `MoveApplied` event sets `isCheckmate: false`. Actual checkmate detection happens later in `checkGameOver()` but the event payload permanently records wrong data. |
| **Fix** | Replace `isCheckmate: false` with `isCheckmate: this.chess.isCheckmate()` at each emission site. Since the move has already been applied to the board at this point, the check is valid. |
| **Test** | Unit test: play a Scholar's Mate sequence. Assert last `MoveApplied` event has `isCheckmate: true`. |
| **Regression risk** | Low. Listeners that ignored `isCheckmate` are unaffected. Listeners that read it now get correct data. |
| **Behavior change** | Data-only — correct values now flow through events and into `MoveRecord`s, benchmark stats, and exports. |

---

### 0.3 Simul runtime not recording moves

| | |
|---|---|
| **File** | `src/engine/simul-runtime.ts` lines 205-213 |
| **Bug** | `applyMove` validates and applies a move via chess.js but never pushes a `MoveRecord` to `board.moveHistory`. `getBoardContext()` always returns empty move records. `moveCount` in `formatBoards` is always 0. |
| **Fix** | After successful move application, push a `MoveRecord` to `board.moveHistory` with the relevant fields (san, from, to, fen, color, moveNumber). |
| **Test** | Unit test: apply 3 moves to a simul board. Assert `board.moveHistory.length === 3` and `getBoardContext().moveRecords` is populated. |
| **Regression risk** | Low. Currently broken (empty) → now populated. Any code relying on empty moveHistory was already getting wrong data. |
| **Behavior change** | Yes — simul mode now tracks moves. This enables proper context for LLM prompts in simultaneous games. |

---

### 0.4 SAN vs UCI comparison in oracle player

| | |
|---|---|
| **File** | `src/engine/oracle-player.ts` ~line 68 |
| **Bug** | `normalizeUCI(parsed.move) === normalizeUCI(positionEval.bestMove)` compares SAN notation (e.g., `Nf3`) from the LLM with UCI notation (e.g., `g1f3`) from Stockfish. These are different systems and never match. Oracle correction loop always enters the fallback path. |
| **Fix** | Convert one notation to the other before comparing. Use `chess.js` to convert: apply the SAN move to get from/to squares, then construct UCI from those, or convert the UCI bestMove to SAN using the current position. |
| **Test** | Unit test: position where LLM returns the same move as Stockfish in SAN. Assert `followedAdvice: true` and that the correction loop is skipped. |
| **Regression risk** | Medium. The oracle has been running in "always correct" mode. Fixing this means the short-circuit path now works, which may change oracle game characteristics. Verify oracle games still complete normally. |
| **Behavior change** | Yes — oracle mode now correctly detects when the LLM already chose the best move, avoiding unnecessary correction. |

---

### 0.5 `processCompromisedDeclaration` hardcodes White winner

| | |
|---|---|
| **File** | `src/engine/response-toolkit.ts` ~line 131 |
| **Bug** | Returns `winner: 'w'` regardless of which player declared compromise. If Black declares, White still wins — which happens to be "correct" (the compromised player loses), but only by coincidence for one color. |
| **Fix** | Accept the declaring player's color as a parameter. Return `winner:` as the opponent's color. `winner: declaringColor === 'w' ? 'b' : 'w'`. |
| **Test** | Unit test: call with `declaringColor: 'b'`. Assert `winner: 'w'`. Call with `declaringColor: 'w'`. Assert `winner: 'b'`. |
| **Regression risk** | Low. Fix makes explicit what was implicitly half-correct. |
| **Behavior change** | Yes — Black's compromise declaration now correctly results in White winning (was already happening by accident) but the code path is now correct for both colors. |

---

### 0.6 OpenAI/OpenRouter streaming condition bug

| | |
|---|---|
| **File** | `src/llm/openai.ts` ~line 189, `src/llm/openrouter.ts` ~line 179 |
| **Bug** | Checks `onToken && response.body` instead of `isStreaming && response.body`. When a model has streaming disabled but `onToken` callback is provided, the code attempts to parse a JSON response as an SSE stream, causing garbled output or parse errors. |
| **Fix** | Change condition to `if (isStreaming && response.body)` in both files. The `isStreaming` variable is already correctly computed earlier (~line 134 in openai.ts). |
| **Test** | Integration test: call a non-streamable model with `onToken` provided. Assert response is parsed as JSON, not SSE. |
| **Regression risk** | Low. Only affects the edge case of non-streamable models with streaming callbacks. Currently broken → now correct. |
| **Behavior change** | No — streaming models still stream. Non-streaming models now correctly fall back to JSON parsing. |

**Bonus fix for openrouter.ts line 190:** Add `extractTextContent()` call to handle array-format content, matching openai.ts behavior.

---

### 0.7 Benchmark `recordGame` race condition

| | |
|---|---|
| **File** | `src/store/benchmarkStore.ts` lines 175-213 |
| **Bug** | `recordGame` reads `state.benchmarkGames` and `state.sourceGames`, then appends and calls `set()`. Concurrent calls (common during auto-play) both read the same snapshot and the second `set()` overwrites the first, losing game data. |
| **Fix** | Use Zustand's `set()` with a callback to read-then-write atomically: `set(state => ({ sourceGames: [...state.sourceGames, game], benchmarkGames: [...state.benchmarkGames, mapped] }))`. This ensures each call sees the latest state. |
| **Test** | Test: call `recordGame` twice in rapid succession (no await). Assert both games appear in `sourceGames`. |
| **Regression risk** | Low. Atomic read-write is strictly more correct. |
| **Behavior change** | No — same data, no longer lost under concurrency. |

---

### 0.8 CPL mapping bug

| | |
|---|---|
| **File** | `src/benchmark/mapper.ts` ~line 206 |
| **Bug** | `centipawnLoss: move.evalCp != null ? Math.abs(move.evalCp) : null` computes CPL as the absolute eval value, not the delta from the best move. True CPL = `bestMoveEval - playedMoveEval`. This produces inflated loss values, especially in losing positions. |
| **Fix** | If per-move best-move eval is available (from Stockfish), compute `Math.max(0, bestEval - playedEval)`. If not available, either mark CPL as `null` or compute it as the delta between consecutive position evals: `Math.max(0, prevEvalCp - currentEvalCp)` (sign-adjusted for color). |
| **Test** | Unit test: move with evalCp=-200 in a position where bestMove eval is -150. Assert CPL is 50, not 200. |
| **Regression risk** | Medium. All historical benchmark CPL data was computed incorrectly. Consider flagging or recomputing existing data. Leaderboard rankings based on CPL will change. |
| **Behavior change** | Yes — CPL values will be much lower and more accurate. This is a data-correctness fix. |

---

### 0.9 Stockfish `formatEval` mate display bug

| | |
|---|---|
| **File** | `src/chess/stockfish.ts` ~line 374 |
| **Bug** | Both branches of the ternary are identical: `evalResult.mateIn > 0 ? \`M${evalResult.mateIn}\` : \`M${evalResult.mateIn}\``. For negative mate (opponent has forced mate), displays `M-3` instead of conventional `-M3`. |
| **Fix** | `return evalResult.mateIn > 0 ? \`M${evalResult.mateIn}\` : \`-M${Math.abs(evalResult.mateIn)}\`;` |
| **Test** | Unit test: `formatEval({ isMate: true, mateIn: -3, scoreCp: -100003 })` → `"-M3"`. |
| **Regression risk** | None. Display-only fix. |
| **Behavior change** | Visual only — mate-in displays now follow chess convention. |

---

### 0.10 Non-deterministic benchmark logic

| | |
|---|---|
| **Files** | `src/engine/transitions.ts` lines 59, 95; `src/engine/attacks.ts` lines 195, 198, 409, 412, 418 |
| **Bug** | `Math.random()` used for attack timing, trigger probability, FEN corruption, and intensity gating. Makes benchmark experiments non-reproducible. |
| **Fix** | Introduce a seeded PRNG (e.g., `mulberry32` or `xoshiro128`) initialized from a configurable seed in `PlayerConfig` or `TournamentConfig`. Replace all `Math.random()` calls in engine/ with `this.rng.next()`. Pass the seed through runtime constructors. Default seed: `Date.now()` for backwards compatibility; explicit seed for reproducible benchmarks. |
| **Test** | Unit test: run the same game config with the same seed twice. Assert identical event sequences. Run with different seeds. Assert different sequences. |
| **Regression risk** | Low if default seed is time-based (preserves current random behavior). Explicit seed is new opt-in functionality. |
| **Behavior change** | No change to default behavior. New capability: reproducible runs when seed is specified. |

**Additional fix for transitions.ts line 59:** Cap probability: `Math.min(1, 0.1 * (moveNumber - trustMoves))` to make the intent clear, even though >1 still triggers.

**Additional fix for transitions.ts lines 108-111:** Add a `firedEvents: Set<string>` to `processScheduledEvents` to prevent re-firing on duplicate calls. Key on `${event.moveNumber}-${event.type}`.

---

## Wave 1 (P1) — Lifecycle, Memory & Async Leaks

These are the "works in a demo, fails in production" bugs. Fix after P0.

---

### 1.1 `parkTournament` runtime leak

| | |
|---|---|
| **File** | `src/store/tournamentStore.ts` ~line 714 |
| **Bug** | `activeRuntime?.pause()` suspends but doesn't abort. Then `activeRuntime: null` drops the reference. The runtime, its closures, and its pending `start()` promise leak. |
| **Fix** | Replace `activeRuntime?.pause()` with `activeRuntime?.abort('Tournament parked')` before nulling. |
| **Test** | Manual test: park a tournament mid-game, check memory via DevTools heap snapshot. Automated: mock runtime, assert `abort()` called on park. |
| **Regression risk** | Low. Parked tournaments currently leak → now clean up. If the user expects to "unpause" a parked game (resume exact position), this changes semantics — but `parkTournament` already nulls the runtime, so resume was already broken. |
| **Behavior change** | Parked games now fully terminate rather than leaking. |

---

### 1.2 Stale store reference in `onGameComplete`

| | |
|---|---|
| **File** | `src/store/tournamentStore.ts` ~line 1269 |
| **Bug** | `const store = useTournamentStore.getState()` captured once. Multiple `setState` calls between lines 1276-1374 make `store` stale. Key stale reads at lines 1304, 1346-1347, 1384. |
| **Fix** | Re-read state at each critical juncture: replace `store.tournament` reads after setState calls with `useTournamentStore.getState().tournament`. Or restructure to a single read-modify-write at end. |
| **Test** | Integration test: complete a game while commentary is active. Assert `commentaryLog` and `evalLog` in the saved match record reflect the actual values, not stale empty objects. |
| **Regression risk** | Low. Stale reads → fresh reads. |
| **Behavior change** | Data saved to completed matches is now correct. |

---

### 1.3 `resumeTournament` missing `waitingForStart`

| | |
|---|---|
| **File** | `src/store/tournamentStore.ts` ~line 249 |
| **Bug** | `resumeTournament` sets `isPaused: false` and status `running` but not `waitingForStart: false`. Tournament gets stuck. |
| **Fix** | Add `waitingForStart: false` to the `set()` call. |
| **Regression risk** | None. |

---

### 1.4 Commentary queue `lastMoveSnapshot` race

| | |
|---|---|
| **File** | `src/commentary/commentaryQueue.ts` ~line 536 |
| **Bug** | `scheduleFillerIfIdle` checks `lastMoveSnapshot` at schedule time, but `runFiller` fires 2s later via `setTimeout`. In between, `reset()` nulls `lastMoveSnapshot`. The `!` assertion crashes. |
| **Fix** | (a) Add `this.cancelFiller()` to `reset()`. (b) Add null guard at top of `runFiller`: `if (!this.lastMoveSnapshot) return;`. |
| **Regression risk** | None. Prevents crash. |

---

### 1.5 `abortGame` stale gameState

| | |
|---|---|
| **File** | `src/store/gameStore.ts` ~line 124 |
| **Bug** | `abortGame` calls `runtime.abort()` and sets `isRunning: false` but never updates `gameState`. Brief window of inconsistent state. |
| **Fix** | Add `gameState: get().runtime?.getState() ?? get().gameState` to the `set()` call, capturing post-abort state. |
| **Regression risk** | Low. |

---

### 1.6 `startGame` stale prior gameState

| | |
|---|---|
| **File** | `src/store/gameStore.ts` ~line 80 |
| **Bug** | `startGame` doesn't reset `gameState` or `viewingMoveIndex`. Old game data visible until first event. |
| **Fix** | Add `gameState: null, viewingMoveIndex: null` to the `set()` call. |
| **Regression risk** | None. Brief flash of empty board instead of stale board. |

---

### 1.7 TTS effect stale dependencies

| | |
|---|---|
| **File** | `src/App.tsx` ~line 53 |
| **Bug** | Effect depends only on `[ttsEnabled]` but closes over `ttsPythonPath`, `ttsModel`, `ttsPort`. Config changes don't restart the TTS server. |
| **Fix** | Change deps to `[ttsEnabled, ttsPythonPath, ttsModel, ttsPort]`. Remove `eslint-disable`. |
| **Regression risk** | Low. TTS server now restarts on config change. Users may notice a brief TTS interruption when changing settings — this is correct. |

---

### 1.8 Fatal `ErrorOccurred` missing `result` and `endedAt`

| | |
|---|---|
| **File** | `src/engine/reducer.ts` ~line 128 |
| **Bug** | Fatal error sets `status: 'error'` but leaves `result: undefined` and `endedAt: undefined`. Benchmark recording and UI both expect terminal states to have these fields. |
| **Fix** | Set `result: { outcome: 'aborted', reason: event.payload.message ?? 'Fatal error' }` and `endedAt: event.timestamp`. |
| **Regression risk** | Low. Terminal states now have complete data. |

---

### 1.9 Event log O(n²) growth

| | |
|---|---|
| **File** | `src/engine/reducer.ts` ~line 28 |
| **Bug** | `eventLog: [...state.eventLog, event]` copies the full array on every event. Quadratic allocation. |
| **Fix** | Mutate in place: `state.eventLog.push(event); return { ...state };`. The reducer owns the state via the outer spread. Alternatively, use a `push`-based persistent array. |
| **Test** | Perf test: run a 200-move game. Measure allocation. Assert < 2x current. |
| **Regression risk** | Medium. Any code holding a reference to a previous `eventLog` array now sees it mutated. Audit all `eventLog` consumers to ensure they snapshot when needed. If risky, use a wrapper class with copy-on-read semantics. |

---

### 1.10 `sourceGames` unbounded growth

| | |
|---|---|
| **File** | `src/store/benchmarkStore.ts` ~line 192 |
| **Bug** | Every `recordGame` appends the full `GameState` (with move histories, event logs) to `sourceGames`. Never trimmed. Memory leak for long sessions. |
| **Fix** | Either (a) cap to a rolling window: `sourceGames: [...state.sourceGames.slice(-100), game]`, or (b) store only a lightweight key/summary, or (c) pass directly to `ingestAndRebuild` without persisting in state. |
| **Regression risk** | Low if using option (a). Any code reading old sourceGames needs to handle the cap. |

---

### 1.11 Module-level mutable singletons

| | |
|---|---|
| **File** | `src/store/tournamentStore.ts` lines 109-130 |
| **Bug** | `_waitForNarration`, `_stopNarration`, `_commentaryQueue` are module-scoped `let`s. Stale after HMR. No lifecycle enforcement. |
| **Fix** | Move into the Zustand store as non-persisted fields (excluded from `persist` partialize). Or use a `Map<string, callback>` with component-identity keys and cleanup on unmount. |
| **Regression risk** | Medium. Requires updating all registration sites. Test narration gating after change. |

---

## Wave 2 (P2) — Deterministic Seeds & Shared Extraction

This is where you buy back velocity and upgrade the system from "interesting experiment" to "repeatable experiment."

---

### 2.1 Seeded PRNG as first-class primitive

| | |
|---|---|
| **Files** | New: `src/engine/rng.ts`. Modified: `src/engine/transitions.ts`, `src/engine/attacks.ts`, `src/engine/runtime.ts`, `src/engine/types.ts` |
| **What** | Create a seedable PRNG module. Add `seed?: number` to `TournamentConfig` and `GameConfig`. Pass RNG instance through runtime constructors. Replace all `Math.random()` in engine/ with `rng.next()`. |
| **Scope** | ~50 lines new utility, ~15 call sites to update. |
| **Regression risk** | Low. Default seed = `Date.now()` preserves current random behavior. |

---

### 2.2 Shared LLM client module

| | |
|---|---|
| **Files** | New: `src/llm/shared.ts`. Modified: `src/llm/openai.ts`, `src/llm/openrouter.ts`, `src/llm/ollama.ts` |
| **What** | Extract `readStream()` (~70 lines), `callWithRetry()` (~35 lines), `needsOutputRecovery()` (~5 lines), and commentary request scaffolding into shared module. Parameterize on provider-specific headers and auth. |
| **Scope** | ~120 lines new shared code, ~300 lines removed from clients. |
| **Regression risk** | Medium. Must verify all three providers still work after extraction. Test each provider's `callChat`, `requestCommentary`, and `requestCommentaryStream`. |

---

### 2.3 Shared Stockfish eval handler

| | |
|---|---|
| **Files** | New: `src/store/eval-updater.ts`. Modified: `src/store/gameStore.ts`, `src/store/tournamentStore.ts` |
| **What** | Extract the ~50-line pattern (init Stockfish, evaluate FEN, guard stale state, update store with eval + log) into a shared function parameterized by `(getState, setState, getCommentatorConfig)`. |
| **Scope** | ~60 lines new, ~100 lines removed (3 copies → 1). |
| **Regression risk** | Low. Same logic, just deduplicated. Test eval display in single game and tournament modes. |

---

### 2.4 Shared benchmark math utilities

| | |
|---|---|
| **Files** | New: `src/benchmark/math-utils.ts`. Modified: `src/benchmark/aggregates.ts`, `src/benchmark/mapper.ts`, `src/benchmark/profile.ts`, `src/benchmark/reports.ts`, `src/utils/metrics.ts` |
| **What** | Extract `average()`, `median()`, `standardDeviation()`, `hashString()`, `pearsonCorrelation()` into shared module. Standardize on null-safe `average()` (return `null` for empty arrays, not `NaN`). |
| **Scope** | ~50 lines new, ~80 lines removed across 5 files. |
| **Regression risk** | Low. Fix the `average([])` → `NaN` bug in reports.ts as part of this. |

---

### 2.5 Shared MoveApplied / GameEnded builders

| | |
|---|---|
| **Files** | New: `src/engine/event-builders.ts`. Modified: `src/engine/runtime.ts` |
| **What** | Extract `buildMoveAppliedPayload(color, validation, moveResult, extras)` and `buildGameEndedPayload(chess, startTime, extras)`. Replace 5 MoveApplied emission sites and 5+ GameEnded sites. |
| **Scope** | ~40 lines new, ~200 lines removed from runtime.ts. |
| **Regression risk** | Medium. The 5 emission sites have slight variations. Must verify each player type still emits correct data. Unit test each player type's move and game-end events. |

---

### 2.6 Shared player config UI

| | |
|---|---|
| **Files** | New: `src/components/shared/PlayerSlotEditor.tsx`, `src/components/shared/player-config-types.ts`. Modified: `src/components/GameControls.tsx`, `src/components/TournamentSetup.tsx` |
| **What** | Extract `PlayerSlotEditor`, `AdvancedSlotConfig` type, `PlayerSlot` interface, `PLAYER_TYPES`, `REASONING_EFFORTS`, `TOKEN_PRESETS`, prompt level picker, and output format picker into shared module. |
| **Scope** | ~300 lines new shared, ~400 lines removed from the two consumers. |
| **Regression risk** | Medium. UI components — must visually verify both Game and Tournament setup screens render correctly. |

---

### 2.7 Ephemeral state reset constant

| | |
|---|---|
| **Files** | New constant in `src/store/tournamentStore.ts`. |
| **What** | Extract `EPHEMERAL_DEFAULTS = { streamingText: '', streamingModel: '', commentary: '', commentaryLog: {}, evalLog: {}, stockfishEval: null, prevEvalCp: null, viewingMoveIndex: null }`. Spread in ~10 locations. |
| **Scope** | ~5 lines new, ~80 lines simplified. |
| **Regression risk** | None. Same values, just deduplicated. |

---

## Wave 3 (P3) — Ergonomics & Polish

Important but lower urgency. Each is independently mergeable.

---

### 3.1 Selector optimization

| **Files** | `src/App.tsx`, `src/components/CommentaryPanel.tsx`, `src/components/LiveStats.tsx`, `src/components/Leaderboard.tsx` |
| **What** | Consolidate multiple `useSettingsStore` / `useTournamentStore` selectors into single selectors with `useShallow` from `zustand/react/shallow`. Fix Leaderboard's unstable `query` object dependency in `useMemo`. |

### 3.2 Memoization passes

| **Files** | `src/App.tsx`, `src/components/TournamentProgress.tsx`, `src/components/GameLayout.tsx`, `src/components/LiveStats.tsx`, `src/components/Board.tsx` |
| **What** | Wrap `lastMove` extraction in `useMemo`. Memoize `totalGamesPlayed`/`completedMatches`. Share single `new Chess(fen)` instance in Board.tsx. Memoize `LivestreamOverlay` stats. |

### 3.3 Type strengthening

| **Files** | `src/engine/types.ts`, `src/engine/events.ts`, `src/store/settingsStore.ts` |
| **What** | Replace `string` with `AttackPattern`/`AttackTiming`/`AttackChannel` in MoveRecord and event payloads. Remove unnecessary `as` casts. Enforce `migrate` return types. Use `??` instead of `||` for numeric defaults throughout llm/. |

### 3.4 HMR hardening

| **Files** | `src/components/TournamentSetup.tsx`, `src/components/Board.tsx`, `src/components/ModelSelector.tsx`, `src/commentary/commentaryQueue.ts` |
| **What** | Replace module-level mutable counters (`nextId`, `markerIdCounter`) with `crypto.randomUUID()` or instance-scoped counters. Clear `ModelSelector` cache on key change. |

### 3.5 Smaller component decomposition

| **Files** | `src/engine/runtime.ts`, `src/store/tournamentStore.ts`, `src/components/TournamentProgress.tsx` |
| **What** | Extract per-player-type handlers from `gameLoop()`. Extract `GameLayout` JSX triplication in TournamentProgress into a helper. Consider splitting `tournamentStore.ts` into orchestration + persistence slices. |

### 3.6 Security hardening

| **Files** | `src/store/settingsStore.ts`, `src/tts/tts-client.ts`, `src/components/ApiKeyInput.tsx` |
| **What** | (a) In Tauri: use secure OS keychain for API keys instead of localStorage. In browser: session-scoped storage option. (b) Validate `ollamaBaseUrl` against localhost/private ranges. (c) Stop spreading API keys into TTS queue entries — pass by reference or use a getter. (d) Add URL validation to `ApiKeyInput` Ollama URL input. |

---

## Execution Notes

### Ordering constraints

- **0.8 (CPL)** should ship with a migration flag or data-recompute notice since it changes benchmark metrics.
- **0.10 (seeds)** and **2.1 (PRNG)** are the same initiative at different depths. 0.10 is the quick `Math.min` + fire-once guard. 2.1 is the full seeded PRNG. Do 0.10 first, 2.1 when ready.
- **2.2 (shared LLM)** is the single highest-velocity unlock. It makes all future LLM provider work 3x faster and eliminates a bug class (inconsistencies between clients).
- **1.9 (event log O(n²))** has the highest regression surface in Wave 1. Consider shipping it last in the wave with extra audit.

### What not to do

- Don't refactor `tournamentStore.ts` structure during Wave 0/1 fixes. Fix bugs in place, extract in Wave 2.
- Don't add a test framework in Wave 0. Add it as part of Wave 2 when the shared modules need it.
- Don't touch benchmark data formats until 0.8 (CPL) is fixed — you'll want to recompute once, not twice.

### Definition of done per wave

| Wave | Done when |
|------|-----------|
| P0 | All 10 items merged. Benchmark data produced after merge is trustworthy. |
| P1 | All 11 items merged. Long sessions (2+ hours, 50+ games) run without memory growth or crashes. |
| P2 | All 7 items merged. Codebase has no triplicated logic. Seeded runs produce identical results. |
| P3 | All 6 items merged. Component renders are minimal. Types are strict. Keys are secured. |
