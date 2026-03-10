# LLM Chess — Full Code Review

**Date:** 2026-03-10
**Scope:** All source files under `src/` (~78 files, ~20,000+ lines)
**Categories:** Bugs, Performance, DRY Violations, Type Safety, Security, Code Quality

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Issues](#critical-issues)
3. [Store Layer](#store-layer)
4. [Engine Core](#engine-core)
5. [LLM Integration](#llm-integration)
6. [Components](#components)
7. [Commentary System](#commentary-system)
8. [Chess / Stockfish](#chess--stockfish)
9. [TTS (Text-to-Speech)](#tts-text-to-speech)
10. [Benchmark System](#benchmark-system)
11. [Utilities](#utilities)
12. [PGN / Replay](#pgn--replay)
13. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Executive Summary

The codebase is a feature-rich chess arena application with LLM integration, tournament management, benchmarking, commentary, and TTS. The architecture uses Zustand stores, a custom game runtime engine, and multiple LLM provider backends.

**Key systemic issues:**
- **~300 lines of triplicated code** across LLM clients (streaming, retry, commentary)
- **~200 lines of duplicated components** between `GameControls` and `TournamentSetup`
- **O(n²) event log growth** from repeated array spreads in the reducer
- **API keys stored in plaintext** in localStorage with no encryption or expiration
- **Non-deterministic game logic** using `Math.random()` without seed support, making benchmarks non-reproducible
- **Several high-severity bugs** including an infinite retry loop, hardcoded `isCheckmate: false`, SAN-vs-UCI comparison failures, and race conditions

**Issue counts:**
- Bugs: 65+
- Performance: 25+
- DRY Violations: 20+
- Type Safety: 15+
- Security: 8
- Code Quality: 25+

---

## Critical Issues

These are the highest-severity bugs that should be addressed first:

| # | Severity | File | Line(s) | Description |
|---|----------|------|---------|-------------|
| 1 | **Critical** | `engine/runtime.ts` | 480 | LLM retry loop never enforces `maxRetries` — infinite retries on illegal moves |
| 2 | **Critical** | `engine/runtime.ts` | 264,322,388,470,678 | `isCheckmate` hardcoded to `false` in all `MoveApplied` events |
| 3 | **Critical** | `engine/simul-runtime.ts` | 205-213 | `applyMove` never records moves in `moveHistory` — board context always empty |
| 4 | **High** | `engine/oracle-player.ts` | 68 | SAN vs UCI comparison means oracle correction loop never short-circuits |
| 5 | **High** | `engine/response-toolkit.ts` | 131 | `processCompromisedDeclaration` hardcodes White as winner regardless of declaring player |
| 6 | **High** | `store/tournamentStore.ts` | 714,731 | `parkTournament` pauses runtime but never aborts — memory/promise leak |
| 7 | **High** | `store/tournamentStore.ts` | 1384 | Stale `store` reference in `onGameComplete` — intermediate state changes lost |
| 8 | **High** | `llm/openai.ts` | 189 | Checks `onToken` instead of `isStreaming` — parses JSON response as SSE stream |
| 9 | **High** | `llm/openrouter.ts` | 179 | Same streaming check bug as openai.ts |
| 10 | **High** | `llm/openrouter.ts` | 190 | Missing `extractTextContent` — array-format content not handled |
| 11 | **High** | `store/benchmarkStore.ts` | 175-213 | Race condition in `recordGame` — concurrent calls corrupt state |
| 12 | **High** | `chess/stockfish.ts` | 374 | `formatEval` mate display: identical ternary branches (copy-paste bug) |
| 13 | **High** | `benchmark/mapper.ts` | 206 | CPL computed as `abs(evalCp)` instead of actual centipawn loss |

---

## Store Layer

### `gameStore.ts` (200 lines)

#### Bugs
- **B-GS1 (lines 124-127):** `abortGame` does not update `gameState` after `runtime.abort(reason)`. The store holds stale state that doesn't reflect the abort outcome. Compare with the `.catch()` handler at line 110 which calls `runtime.getState()`.
- **B-GS2 (line 80):** `startGame` does not clear `gameState` before runtime begins. Between `set()` and the first `subscribe` callback, components display stale data from the prior game.
- **B-GS3 (lines 129-140):** `clearGame` does not clear `streamingText` or `streamingModel`. Stale streaming text persists after clearing.

#### Performance
- **P-GS1 (lines 155-199):** No Stockfish eval deduplication. Rapid moves queue concurrent evaluations; the staleness guard discards late results but doesn't prevent wasted CPU.

#### DRY Violations
- **D-GS1:** `handleMoveApplied` (lines 155-199) is nearly identical to `tournamentStore.ts` lines 1134-1186 and 1192-1241. A shared utility parameterized on store reference and commentator config would eliminate ~130 lines.
- **D-GS2:** `evalLog` type definition (line 21) is inline and repeated in `tournamentStore.ts` line 66.

#### Type Safety
- **T-GS1 (line 21):** `evalLog: Record<number, ...>` but JS object keys are always strings. Could cause subtle comparison bugs.

---

### `tournamentStore.ts` (1474 lines)

#### Bugs
- **B-TS1 (line 714):** `parkTournament` pauses the runtime but never aborts it. The runtime's `start()` promise is still pending. Setting `activeRuntime: null` at line 731 drops the reference but the runtime, closures, and promise leak.
- **B-TS2 (line 1384):** `const store = useTournamentStore.getState()` captures a snapshot at line 1269. By line 1384, multiple `setState` calls have occurred (1276, 1303, 1312, 1342), making `store.tournament` stale.
- **B-TS3 (lines 390-391):** `goToMatch` silently resets completed matches to `in_progress`, discarding results without warning.
- **B-TS4 (lines 249-258):** `resumeTournament` does not set `waitingForStart: true` when no runtime exists, leaving the tournament in a `running` state with nothing executing.
- **B-TS5 (line 201):** `startTournament` only exempts `codex` from API key check, but Ollama also doesn't use API keys. Ollama users can't start tournaments.
- **B-TS6 (lines 127-129):** `_commentaryQueue` is registered but never read — dead code.
- **B-TS7 (lines 109-130):** Module-level mutable singletons (`_waitForNarration`, `_stopNarration`, `_commentaryQueue`) break on HMR.

#### Performance
- **P-TS1:** Deep spreading of tournament state (3-4 levels) on every game event creates significant GC pressure.
- **P-TS2 (lines 693-706):** `syncToMap` creates a full shallow copy of the tournaments map on every call.

#### DRY Violations
- **D-TS1:** Ephemeral state reset pattern (`streamingText`, `streamingModel`, `commentary`, `commentaryLog`, `evalLog`, `stockfishEval`, `prevEvalCp`, `viewingMoveIndex`) repeated ~10 times across `clearTournament`, `parkTournament`, `deleteTournament`, `skipMatch`, `goToMatch`, `retryGame`, `resumeGame`, `startReplay`, `stopReplay`. Extract to `EPHEMERAL_DEFAULTS`.
- **D-TS2:** `handleMoveApplied` and `handleReplayMoveApplied` (lines 1134-1186 vs 1192-1241) differ only in commentator config source. Three-way duplication with `gameStore.ts`.

#### Type Safety
- **T-TS1 (line 340):** `match.status` set to `'skipped'` without type-level guarantee it's in the union.
- **T-TS2 (line 993):** `matchCalc.result!` assertion without type narrowing.

#### Code Quality
- **C-TS1 (line 126):** `import type { CommentaryQueue }` buried at line 126, after 120 lines of code.
- **C-TS2 (lines 421-427, 530-535):** Extensive tuple type cast gymnastics (`const games: typeof pair.games = [...pair.games] as typeof pair.games`).

---

### `benchmarkStore.ts` (289 lines)

#### Bugs
- **B-BS1 (lines 175-213):** Race condition in `recordGame`. Concurrent calls read `state.benchmarkGames` at the same time, append independently, and the second `set()` overwrites the first — losing game data.
- **B-BS2 (lines 99-104):** Non-transactional persistence in `ingestAndRebuild`. Six sequential `await` calls; a crash between saves leaves the database inconsistent.
- **B-BS3 (line 192):** `sourceGames` grows unboundedly. `GameState` objects are large (full move histories, event logs). Memory leak for long sessions.

#### Performance
- **P-BS1 (lines 67-74):** `sortLeaderboard` allocates and sorts a new array on every call.
- **P-BS2 (line 240):** `getLeaderboard` filters then re-sorts already-sorted aggregates. The sort is redundant.

#### Code Quality
- **C-BS1 (line 52):** `recordGame` typed as `void` but performs async work. Callers can't await or handle errors.

---

### `settingsStore.ts` (237 lines)

#### Security
- **S-SS1 (line 154):** API keys stored in plaintext in localStorage via Zustand `persist`. Accessible to any JavaScript on the same origin.
- **S-SS2 (lines 77, 112):** No URL validation on `ollamaBaseUrl`. A value like `https://attacker.com` would redirect all Ollama requests.

#### Bugs
- **B-SS1 (line 105):** `setProvider` silently loses API keys for providers not in `ProviderKeys`. The interface only has `openrouter` and `openai`; new providers silently get empty keys.
- **B-SS2 (lines 169-189):** Migration for versions 3-6 returns early without provider normalization logic. Corrupted provider values pass through unvalidated.

#### DRY Violations
- **D-SS1 (lines 96-141):** 17 nearly identical single-field setter functions. Could use a generic setter factory.

#### Code Quality
- **C-SS1 (lines 17, 73):** `apiKey` is a denormalized copy of `providerKeys[provider]`. Dual-source-of-truth pattern is error-prone.
- **C-SS2 (lines 82, 85):** Unnecessary `as` casts on initial values that are already valid union members.

#### Type Safety
- **T-SS1 (lines 156-233):** `migrate` function returns `as SettingsState` assertions rather than letting TypeScript verify the shape.

---

## Engine Core

### `runtime.ts` (982 lines)

#### Bugs
- **B-RT1 (line 480):** LLM retry loop has no upper bound check against `maxRetries`. The inner `while (!this.aborted)` loop increments `moveAttempt` but never checks `effectivePlayer.maxRetries`. Will retry forever on persistent illegal moves.
- **B-RT2 (lines 264, 322, 388, 470, 678):** `isCheckmate` is hardcoded to `false` in every `MoveApplied` event. Checkmate detection happens later in `checkGameOver()`, but event payload permanently records incorrect data.
- **B-RT3 (line 481):** Dead code: `if (this.aborted) return;` immediately inside `while (!this.aborted)`.
- **B-RT4 (lines 798-803):** `streamed` variable captures accumulated text vs delta ambiguously. Contract with `ConstraintEnforcer.enforceWallClock` is fragile.
- **B-RT5 (lines 271-273):** Stockfish illegal move path logs error but doesn't `continue` properly. After 3 illegal moves, game silently terminates without proper GameEnded/GameAborted event.

#### Performance
- **P-RT1:** Unbounded `eventLog` growth with O(n²) total allocation from `[...state.eventLog, event]` on every event.
- **P-RT2 (lines 198, 597):** `getLegalMoves()` called twice per turn — once for the move context, once inside `console.log`.

#### DRY Violations
- **D-RT1:** `MoveApplied` event construction duplicated 5 times (lines 252-268, 309-339, 376-392, 458-474, 666-726) across stockfish, oracle, replay, human, and LLM player types. ~100 lines of duplication.
- **D-RT2:** `GameEnded` emission duplicated 5+ times with identical `finalFen`, `totalMoves`, `durationMs` pattern.

#### Type Safety
- **T-RT1 (line 975):** `as GameEvent` cast bypasses discriminated union checking.
- **T-RT2 (lines 773-797):** 25-field anonymous return type for `requestLlmDecision` should be a named interface.

#### Code Quality
- **C-RT1:** `gameLoop` is ~570 lines handling 5 player types. Should be decomposed into per-player-type methods.

---

### `orchestrator-runtime.ts` (302 lines)

#### Bugs
- **B-OR1 (lines 156-167):** `parseOrchestratorResponse` silently swallows JSON parse errors. Malformed JSON results in raw text being assigned as "advice" to every player.
- **B-OR2 (lines 283-284):** Move comparison (`move.toLowerCase() === advice.recommendedMove.toLowerCase()`) doesn't normalize notation differences (`Nf3` vs `Ng1f3`, `O-O` vs `0-0`).

#### Performance
- **P-OR1 (lines 188-196):** Sequential Stockfish evaluations in `generateStockfishAdvice` could be parallelized.
- **P-OR2 (lines 218-219):** `sf.resetStrength()` called inside loop per board; could be called once.

---

### `turn-runtime.ts` (212 lines)

#### Bugs
- **B-TR1 (lines 208-212):** `inferPhase` uses inconsistent units — `turnNumber` (chess move number, increments per 2 plies for black) vs `moveCount` (one per ply). Produces unpredictable phase boundaries.
- **B-TR2 (lines 71-72, 127):** `systemPrompt` computed via `buildSystemPrompt` can be entirely overwritten by `InjectionEvent`, losing eval-awareness modifications and response toolkit appendages.

#### Type Safety
- **T-TR1 (lines 115-153):** Multiple `as` casts on `event.payload` fields. No runtime validation of `Record<string, unknown>` values.

---

### `simul-runtime.ts` (238 lines)

#### Bugs
- **B-SR1 (lines 205-213):** `applyMove` validates and applies a move but never records it in `moveHistory`. Board context from `getBoardContext` always shows empty move records.
- **B-SR2 (line 161):** `parseSimulResponse` regex `[A-Za-z0-9+#=]+` is too permissive and matches non-move text.

#### DRY Violations
- **D-SR1 (lines 134-139):** `formatBoards` interleaved vs non-interleaved branches produce identical output. Dead conditional.

---

### `transitions.ts` (168 lines)

#### Bugs
- **B-TN1 (lines 59, 95):** `Math.random()` for game logic makes experiments non-reproducible. No seed support.
- **B-TN2 (line 59):** `random_trigger` probability formula `0.1 * (moveNumber - trustMoves)` exceeds 1.0 after a few moves, effectively becoming `always_on`.
- **B-TN3 (lines 108-111):** `processScheduledEvents` doesn't track which events have fired. Same events can fire twice on pause/resume or duplicate calls.

#### Type Safety
- **T-TN1 (lines 117-166):** `applyInjectionEvent` return type declares fields that half the branches don't populate.

---

### `types.ts` (753 lines)

#### Type Safety
- **T-TY1 (line 586):** Inline `import('./events').GameEvent[]` creates hidden circular dependency.
- **T-TY2 (lines 539-542):** `activeAttackVectors` uses `{ channel: string }` instead of the `AttackChannel` type.
- **T-TY3 (lines 540-541):** `attackPattern` and `attackTiming` are `string` instead of their respective types.

#### Code Quality
- **C-TY1 (lines 738-740):** FEN parsing via `split(' ')` is fragile for malformed FENs.

---

### `events.ts` (198 lines)

#### DRY Violations
- **D-EV1:** `MoveAppliedEvent.payload` and `MoveRecord` share ~40 identical fields. Should share a common base interface.

---

### `reducer.ts` (137 lines)

#### Bugs
- **B-RD1 (lines 128-131):** `ErrorOccurred` with `fatal: true` sets status to `'error'` but doesn't set `result` or `endedAt`. Downstream consumers see `undefined` for a game that's effectively over.

#### DRY Violations
- **D-RD1 (lines 58-108):** MoveRecord construction is a 48-line manual field copy from event payload. Should use a mapping helper.

#### Performance
- **P-RD1 (line 28):** Spread of entire state + eventLog on every event. Combined with runtime's emit pattern, this is O(n²) in event count.

---

### Other Engine Files

#### `fog-of-war.ts`
- **B-FW1 (lines 148-151):** `own_pieces` mode reveals empty squares, which indirectly reveals where enemy pieces are NOT.
- **P-FW1 (lines 237-244):** `processScoutAction` does a full 64-square scan to find a named square. Direct computation would be O(1).

#### `attacks.ts`
- **B-AT1 (line 195):** `fenCorruption` with `swap_pieces` only replaces the first knight with a bishop deterministically — no randomness despite documentation saying "random."
- **B-AT2 (line 198):** `add_phantom` replaces first `1` in FEN with `n`, but this only works when there's a literal `1` digit. Unreliable and can produce invalid FENs.
- **C-AT1 (lines 409, 412, 418):** `Math.random() < intensity` makes attack behavior non-deterministic/non-reproducible.

#### `advisor.ts`
- **B-AD1 (line 229):** `normalizeMove` lowercases SAN notation, but SAN is case-sensitive. Comparing lowercased SAN with UCI format will never match even for identical moves.
- **B-AD2 (lines 56-58):** `resetStrength()` bypasses Stockfish queue and can race with concurrent evaluations.

#### `oracle-player.ts`
- **B-OP1 (line 68):** SAN vs UCI comparison (`normalizeUCI(parsed.move) === normalizeUCI(positionEval.bestMove)`) — these are different notation systems and will never match by string comparison. Oracle correction loop never short-circuits.

#### `response-toolkit.ts`
- **B-RST1 (line 131):** `processCompromisedDeclaration` hardcodes `winner: 'w'`. If Black declares compromise, White still wins. Should accept declaring player's color.

#### `constraints.ts`
- **B-CN1 (lines 87-110):** `switch` has no `default` case. New `TimeoutBehavior` values would return `undefined`.

---

## LLM Integration

### `openai.ts` (449 lines)

#### Bugs
- **B-OA1 (line 189):** Checks `onToken && response.body` instead of `isStreaming && response.body`. If streaming is disabled for a model but `onToken` is provided, this attempts to parse a JSON response as an SSE stream.
- **B-OA2 (line 86):** `downgradeModel` fires unconditionally if `buildResponseFormat` returns truthy, even if the empty response was unrelated to structured output.

#### DRY Violations
- **D-OA1 (lines 294-312 vs 335-354):** `requestCommentary` and `requestCommentaryStream` duplicate entire fetch setup.
- **D-OA2:** `readStream` (~70 lines) nearly identical to `openrouter.ts` and `ollama.ts`.

#### Type Safety
- **T-OA1 (line 149):** `maxTokens || 6000` — if `maxTokens` is explicitly `0`, falls back to 6000. Should use `??`.

#### Code Quality
- **C-OA1 (line 251):** `onToken(accumulated)` passes full accumulated text rather than delta, diverging from typical streaming APIs.

---

### `openrouter.ts` (402 lines)

#### Bugs
- **B-OR1 (line 159):** `window.location.origin` throws `ReferenceError` in non-browser environments.
- **B-OR2 (line 179):** Same `onToken` vs `isStreaming` bug as openai.ts.
- **B-OR3 (line 190):** Missing `extractTextContent` call — array-format content produces `[object Object]`.

#### DRY Violations
- **D-OR1:** Headers block duplicated 4 times (lines 156-161, 293-299, 329-335, 349-355).
- **D-OR2:** `needsOutputRecovery` is an exact duplicate of the function in openai.ts.
- **D-OR3:** `callWithRetry` closure (~35 lines) nearly identical to openai.ts.

---

### `ollama.ts` (286 lines)

#### DRY Violations
- **D-OL1:** `callChat`, `readStream`, `requestCommentary`, `requestCommentaryStream` all follow the same patterns as the other two clients.

#### Code Quality
- **C-OL1 (line 270):** `context_length: 131072` hardcoded for all Ollama models. Many models have much smaller contexts.

---

### `prompts.ts` (604 lines)

#### Bugs
- **B-PR1 (lines 313-314):** `player.linePrediction.count` and `.depth` used directly without clamping applied elsewhere. Prompt tells LLM "predict N lines" but schema only allows up to 3. Contradictory instructions.

#### Performance
- **P-PR1 (line 214):** `new Chess(fen)` constructed every call to `fenToAsciiBoard`. Creates full engine instance just for rendering.

---

### `parser.ts` (183 lines)

#### Bugs
- **B-PA1 (line 127):** Fallback regex `/"move"\s*:\s*"[^"]+?"` uses non-greedy matching that may match incomplete JSON with nested braces.
- **B-PA2 (line 163):** Pawn move regex matches substrings in FEN strings and commentary text, producing false positives from reasoning.

---

### `model-capabilities.ts` (411 lines)

#### Bugs
- **B-MC1 (line 44):** `RUNTIME_DOWNGRADES` loaded from localStorage at module load. Multiple tabs can overwrite each other's downgrades.
- **B-MC2 (lines 350-357):** `resetDowngrades` inserted between two JSDoc comments, breaking the association for `buildReasoningParams`.

---

### `openai-codex-bridge.ts` (152 lines)

#### Bugs
- **B-CB1 (line 37):** Client accepts `onToken` but emits only once with complete content, not incrementally.
- **B-CB2 (line 137):** Rate limit (429) errors wrapped in `PermanentAPIError`, preventing retry logic from working.

---

## Components

### `App.tsx` (505 lines)

#### Bugs
- **B-AP1 (lines 81-90):** `lastMove` extraction scans full `eventLog` on every render with no memoization.
- **B-AP2 (lines 195, 201-202):** Stale `stockfishEval` and `prevEvalCp` attached to enqueued moves. Eval is async, so values belong to previous move.
- **B-AP3 (lines 38-54):** TTS server not restarted when config changes (model, port). eslint-disable masks real dependency issue.
- **B-AP4 (lines 181-188):** `MoveApplied` matching by SAN is ambiguous when same SAN appears multiple times.

#### Performance
- **P-AP1 (lines 33-36):** Four separate `useSettingsStore` selectors create four subscriptions. Use `useShallow`.
- **P-AP2 (line 132):** `commentaryEntries` state triggers full subtree re-render on every commentary update.
- **P-AP3 (line 215):** `moveEvents` array re-created on every `useMemo` evaluation.

#### Code Quality
- **C-AP1 (lines 120, 215):** Inline `import()` type syntax instead of proper imports.
- **C-AP2 (line 250):** Unused `replayMode` subscription in `TournamentTab` causes unnecessary re-renders.
- **C-AP3 (lines 305, 307):** Same `.filter()` expression runs twice in same JSX block.

---

### `TournamentProgress.tsx` (1141 lines)

#### Bugs
- **B-TP1 (lines 263-265):** `stockfishEval` and `prevEvalCp` passed to all batch-enqueued moves are from the latest position, not the move's position.
- **B-TP2 (lines 241-251):** SAN-only fallback matching can pick wrong event when multiple moves share the same SAN.
- **B-TP3 (line 205):** Stale closure in `useEffect` — reads `replayMode` and `commentatorModel` from outer closure that may be stale.

#### Performance
- **P-TP1 (lines 59-62):** `totalGamesPlayed` and `completedMatches` traverse all matches/pairs every render without `useMemo`.
- **P-TP2 (lines 222-270):** Full event log filter on every move history change.
- **P-TP3 (lines 276-285, 383-393):** Linear scan for last move on every render, unmemoized.

#### DRY Violations
- **D-TP1 (lines 456-536, 542-569):** `<GameLayout>` JSX rendered with nearly identical props in three branches.

---

### `TournamentSetup.tsx` (960 lines)

#### Bugs
- **B-TS-UI1 (line 125):** Module-level mutable `nextId` counter. Collisions possible across HMR and StrictMode.
- **B-TS-UI2 (lines 818-850 + 917-930):** Duplicate depth selector rendered for Stockfish player type — two depth selectors appear simultaneously.

#### DRY Violations
- **D-TS-UI1:** ~200 lines duplicated with `GameControls.tsx`: `AdvancedSlotConfig` type, `PlayerSlot` interface, `PLAYER_TYPES`, `REASONING_EFFORTS`, `TOKEN_PRESETS`, prompt level picker, output format picker, and `PlayerSlotEditor` component.

---

### `GameControls.tsx` (534 lines)

#### Bugs
- **B-GC1 (lines 123-132):** `handleAbort` captures stale `gameState` via `useCallback`. `recordGame` called with pre-abort snapshot.

#### DRY Violations
- See `TournamentSetup.tsx` DRY violations above — all apply here.

---

### `GameLayout.tsx` (315 lines)

#### Bugs
- **B-GL1 (line 103):** Player identification uses `displayName.includes(streamingModel.split('/').pop())` — unreliable substring match.
- **B-GL2 (lines 61-63):** `StockfishBar` uses same text color class for both white and black advantage.

#### Performance
- **P-GL1 (lines 92-99):** `LivestreamOverlay` recomputes move stats on every render without memoization.
- **P-GL2 (lines 174-186):** `visibleGameState` creates new spread every render during narration, breaking child memo caches.

---

### `Board.tsx` (296 lines)

#### Bugs
- **B-BD1 (line 63):** Side effect (`markerIdCounter++`) inside `useMemo` with empty deps. React may recompute memoized values, incrementing counter extra times.
- **B-BD2 (lines 197-200, 202-215):** `new Chess(fen)` instantiated twice per FEN change. Should share a single memo.

---

### `Leaderboard.tsx` (457 lines)

#### Performance
- **P-LB1 (lines 76-92):** `useMemo` has unstable `query` object as dependency (constructed inline), recomputes every render.
- **P-LB2 (lines 105-108):** `comparisonRows` and `curveRows` computed every render with no memoization. `curveRows` sort is O(n log n) each render.

---

### `ModelSelector.tsx` (224 lines)

#### Bugs
- **B-MS1 (line 64):** Module-level `cachedModels` record never cleared. Stale model lists persist after API key changes.
- **B-MS2 (lines 153-220):** Dropdown has no click-outside handler to close it.

#### Performance
- **P-MS1 (lines 135-136):** `favoriteModels.includes()` inside sort comparator is O(n) per comparison. Use a `Set`.

---

### `TournamentResults.tsx` (264 lines)

#### Bugs
- **B-TR-UI1 (lines 187-189):** Hardcoded access to `match.pairs[2]`. If fewer than 3 pairs, runtime error.

---

### `LiveStats.tsx` (208 lines)

#### Performance
- **P-LS1 (lines 35-57):** Multiple `.filter()` calls over `moveHistory` and `eventLog` every render without memoization — O(n) repeated 6 times.

---

### `ApiKeyInput.tsx` (297 lines)

#### Security
- **S-AK1 (line 92):** `fetch(\`${baseUrl}/api/tags\`)` — user-supplied `ollamaUrlInput` directly interpolated into fetch URL. Enables SSRF in Tauri context.

---

### `CommentaryPanel.tsx` (273 lines)

#### Performance
- **P-CP1 (lines 40-46):** `synthOptions` is a new object every render. Closures and effects capturing it trigger unnecessary re-runs.

---

## Commentary System

### `commentaryQueue.ts` (599 lines)

#### Bugs
- **B-CQ1 (line 536):** `this.lastMoveSnapshot!` — non-null assertion after check at line 503. Between `scheduleFillerIfIdle` and the `setTimeout` callback firing, `reset()` sets `lastMoveSnapshot = null`. Race condition causes crash.
- **B-CQ2 (line 343):** `Math.max(...batch.map(m => m.moveIndex))` — if `batch` is empty (despite guard), returns `-Infinity`.

#### Performance
- **P-CQ1 (lines 198, 354, 430, 442, 565):** Every entry update clones the entire entries array. Heavy GC pressure with many entries.

---

### `batchPrompt.ts` (169 lines)

#### Bugs
- **B-BP1 (line 66):** When `ev.isMate` is true and `mateIn` is null, falls through to numeric branch showing meaningless 1000+ pawn eval.

#### DRY Violations
- **D-BP1 (lines 73-85):** `evalStr` computation pattern repeated identically across 4 branches.

---

## Chess / Stockfish

### `stockfish.ts` (378 lines)

#### Bugs
- **B-SF1 (lines 372-375):** `formatEval` mate display — both branches of the ternary are identical (`M${evalResult.mateIn}`). Copy-paste bug. For negative mate, should display `-M${Math.abs(evalResult.mateIn)}`.
- **B-SF2 (lines 294-298):** `setSkillLevel` and `resetStrength` bypass the command queue. Can interleave with active eval's UCI commands.

#### Code Quality
- **C-SF1 (lines 348-366):** Singleton pattern with module-level `let` variables. No cleanup; Web Workers leak permanently.

---

## TTS (Text-to-Speech)

### `audio-queue.ts` (390 lines)

#### Bugs
- **B-AQ1 (lines 219-231):** `waitUntilDone` polls with `setTimeout(check, 250)` forever if `isActive` never returns false. No abort mechanism; leaks timer chain.

#### Performance
- **P-AQ1 (lines 261-263):** Prefetch network requests for removed items complete wastefully.

#### DRY Violations
- **D-AQ1 (lines 92-122 vs 127-148):** `enqueueEntry` and `enqueue` share nearly identical sentence-splitting logic.
- **D-AQ2 (lines 154-172 vs 189-205):** `interruptAndPlay` and `stop` share identical cleanup logic.

---

### `tts-client.ts` (250 lines)

#### Security
- **S-TTS1:** API key (`cloudApiKey`) gets spread into every `QueueEntry` object. If entries are ever serialized or logged, the key leaks.
- **S-TTS2 (lines 199-205):** `checkCloudTtsHealth` performs a real billable synthesis call. Could be exploited if called repeatedly.

---

## Benchmark System

### `mapper.ts` (342 lines)

#### Bugs
- **B-MP1 (line 206):** Centipawn loss computed as `Math.abs(move.evalCp)` instead of the difference from the best move. Semantically incorrect — produces inflated loss values.
- **B-MP2 (line 322):** Dead ternary: `resultReason: result === 'aborted' ? perspectiveResultReason : perspectiveResultReason` — identical branches.

#### DRY Violations
- **D-MP1:** `average`, `median`, `hashString` duplicated across `aggregates.ts`, `mapper.ts`, `profile.ts`, and `reports.ts`.

---

### `aggregates.ts` (362 lines)

#### Performance
- **P-AG1 (lines 201-204):** `getScore(game)` called 4 times per game. Could compute once and cache.

---

### `reports.ts` (445 lines)

#### Bugs
- **B-RP1 (line 18):** `average([])` returns `NaN` (division by zero). The version in `aggregates.ts` returns `null`.

#### DRY Violations
- **D-RP1:** `hashString`, `average`, `standardDeviation` duplicated across 3-4 benchmark files.

---

### `db.ts` (159 lines)

#### Bugs
- **B-DB1 (line 56):** Index named `'conditionId'` uses keyPath `'profileId'`. Either a copy-paste bug or misleading name.

---

### `repository.ts` (147 lines)

#### Performance
- **P-RP1 (lines 85-88):** `loadProfile` calls `getAll('profiles')` then linearly scans. IndexedDB `get()` by key would be O(1).
- **P-RP2 (lines 113-117):** `deleteProfile` loads all, filters, clears, and re-inserts. IndexedDB `delete()` by key would be far more efficient.

---

### `legacy.ts` (206 lines)

#### Bugs
- **B-LG1 (lines 134-136):** Elo CI hardcoded as `+/- 32` regardless of sample size. Not a real confidence interval.
- **B-LG2 (line 144):** `medianCentipawnLoss` set to `stats.avgCentipawnLoss` — using the average as the median is incorrect.

---

### `profile.ts` (388 lines)

#### Bugs
- **B-PF1 (lines 267-283):** `diffProfiles` calls `stableStringify` at top level including `profileId`, `profileName`, and `createdAt`, which always differ. Top-level equality check is useless.

#### Type Safety
- **T-PF1 (lines 316-335):** `hotSwapProfile` uses `as PlayerConfig` cast. Missing fields silently absent.

---

### `export.ts` (231 lines)

#### DRY Violations
- **D-EX1 (benchmark/export.ts lines 167-169):** ZIP file count uses `uint16`, limiting to 65,535 files.

---

## Utilities

### `utils/export.ts` (898 lines)

#### DRY Violations
- **D-UE1 (lines 309-421 vs 690-769):** `extractGameRow` and `extractBenchmarkGameRow` are ~90% identical. Massive duplication.

#### Performance
- **P-UE1 (lines 542-548):** `findGameState` uses linear scan per game in `exportTournamentJSON`, making the full export O(n²).

#### Security
- **S-UE1 (lines 570-578):** `downloadFile` revokes blob URL immediately after `a.click()`. Browser download initiation is async; may race on some browsers. Use `setTimeout(() => URL.revokeObjectURL(url), 60000)`.

---

### `metrics.ts` (373 lines)

#### Bugs
- **B-MT1 (line 154):** `computeReasoningEvalCoherence` checks `m.evalCp !== undefined` but `evalCp` can be `null`. `null !== undefined` is `true`, so null evals sneak through. `Math.abs(null!)` = `0`, silently corrupting the correlation.

#### DRY Violations
- **D-MT1 (lines 352-373):** `pearsonCorrelation` near-duplicate of `aggregates.ts` `correlation` function.

---

### `chess-squares.ts` (143 lines)

#### Bugs
- **B-CS1 (lines 22-25):** Castling square extraction hardcodes both `c1`/`c8` and `g1`/`g8` for all castling moves, highlighting squares for both colors regardless of which side actually castled.

---

## PGN / Replay

### `replay-runtime.ts` (264 lines)

#### Bugs
- **B-RR1 (line 159):** `chess.applyMove(move.san)` return value assigned but never checked. If the move fails, replay continues with corrupted board state.
- **B-RR2 (line 169):** Uses parsed PGN FEN instead of `chess.fen()` after applying. Could emit incorrect FEN.
- **B-RR3 (lines 235-249):** `delay` method appears to be dead code — never called. Pacing handled by `commentaryGate` and `narrationGate`.
- **B-RR4 (line 254-263):** `buildReplayPlayerConfig` accepts `color` parameter but never uses it.

---

### `pgn/parser.ts` (182 lines)

#### Code Quality
- **C-PG1 (lines 178-179):** `pgnResultToGameResult` assumes `1-0` and `0-1` always mean checkmate. PGN results can indicate resignation, timeout, etc.

---

## Cross-Cutting Concerns

### Systemic DRY: LLM Client Triplication
`readStream` (~70 lines), `callWithRetry` (~35 lines), `needsOutputRecovery`, and commentary methods are copy-pasted across `openai.ts`, `openrouter.ts`, and `ollama.ts`. **~300 lines of duplication.** Recommendation: Extract to a shared `llm/shared.ts` module.

### Systemic DRY: Component Duplication
`GameControls.tsx` and `TournamentSetup.tsx` share ~200 lines of duplicated types, constants, and `PlayerSlotEditor` component. Extract to a shared module.

### Systemic DRY: Stockfish Eval Handler
The same ~50-line pattern (init Stockfish, evaluate FEN, guard stale state, update store) appears in 3 places across `gameStore.ts` and `tournamentStore.ts`. Extract to a shared function.

### Systemic DRY: Benchmark Math Utilities
`average`, `median`, `hashString`, `standardDeviation`, `pearsonCorrelation` duplicated across 4-5 files. Extract to `benchmark/math-utils.ts`.

### Systemic Performance: O(n²) Event Log
Every event triggers `[...state.eventLog, event]` in the reducer, producing O(n²) total allocation for a game. Consider an immutable list structure or batch updates.

### Systemic Security: API Key Hygiene
API keys flow through `settingsStore` → `gameStore`/`tournamentStore` → TTS queue entries, all in plaintext localStorage. No encryption, expiration, session-scoped cleanup, or secure storage backend.

### Systemic Architecture: Module-Level Mutable State
Module-scoped `let` variables in `tournamentStore.ts` (3 vars), `stockfish.ts` (2 singletons), `TournamentSetup.tsx` (`nextId`), `Board.tsx` (`markerIdCounter`), `ModelSelector.tsx` (`cachedModels`), and `commentaryQueue.ts` (`nextId`) are fragile during HMR and make testing difficult.

### Systemic Architecture: Non-Deterministic Game Logic
`Math.random()` in `transitions.ts` and `attacks.ts` makes benchmark experiments non-reproducible. Consider adding seed support for deterministic runs.
