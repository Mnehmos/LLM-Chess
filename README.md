# LLM Chess

LLM-vs-LLM chess arena, tournament gauntlet, and benchmark app built with React, TypeScript, Vite, Zustand, and `chess.js`. Optional Tauri desktop wrapper.

## Features

- **Single Game Mode** — Live move streaming, move history, event log, board stepping, and per-move Stockfish evaluation.
- **Tournament Gauntlet** — Challenger vs multiple defenders with opening randomization, auto-play, match parking/resuming, and configurable best-of-3 pairs.
- **Multi-Provider LLM Support** — OpenRouter, OpenAI, Ollama (local), and Codex with device auth. Per-model benchmark stats (Elo, legality rate, response times, retries).
- **AI Commentary** — Real-time LLM commentary with move batching, filler generation, and optional TTS narration (local Python server or cloud API).
- **Advanced Player Config** — Prompt levels, output formats, reasoning effort, fog-of-war, attack channels (prompt injection, FEN corruption, context bloat), advisor modes, and constraint enforcement.
- **Benchmark System** — Automated data collection, Elo estimation, aggregated statistics, leaderboard with filtering, and IndexedDB persistence.
- **Exports** — PGN, CSV, JSON, and ZIP for single games, tournaments, and benchmark data.
- **PGN Import & Replay** — Import PGN files and replay with live commentary and narration.

## Match History Archive

This repo now keeps exported match and tournament histories under [matches](./matches) so important runs are not stranded only in local `Downloads`.

Current archived exports:

- [Nemotron Super 120B Free vs 8 defenders, aborted gauntlet JSON](./matches/2026-03-13/gauntlet_Nemotron_Super_120B_Free_vs8_2026-03-13T03-26-03.json)
- [Gemini 3.1 Pro Preview vs Stockfish 1500, single-game JSON](./matches/2026-03-13/Gemini_3_1_Pro_Preview_vs_Stockfish_1500_ELO_white_wins_checkmate_2026-03-13T18-54-24.json)

The JSON exports include full move history, commentary text when present, stated model reasoning, timing, and token accounting fields.

Important caveat:

- Hidden provider chain-of-thought is only exportable when the provider actually exposes it. Today the app reliably stores the model's stated reasoning text plus numeric `reasoningTokens`, but it does not reconstruct or invent hidden reasoning-token content that the provider does not return.

## Requirements

- Node.js `20.19+` (or `22.12+`), npm.
- At least one LLM provider:
  - **OpenRouter** — API key from [openrouter.ai](https://openrouter.ai)
  - **OpenAI** — API key from [platform.openai.com](https://platform.openai.com)
  - **Ollama** — Local instance running (no API key needed)
  - **Codex** — Device authorization flow (no API key needed)

## Quick Start

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Scripts

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run lint      # ESLint check
npm run preview   # Preview production build
```

## Project Layout

```
src/
  engine/         # Core game logic: runtime, turns, events, reducer, attacks, fog-of-war
  llm/            # LLM provider clients, prompt construction, response parsing
  chess/          # chess.js wrapper and Stockfish Web Worker integration
  store/          # Zustand stores (game, tournament, benchmark, settings)
  components/     # React UI components
  commentary/     # AI commentary queue, batch prompts, filler generation
  tts/            # Text-to-speech audio queue and synthesis client
  benchmark/      # Data pipeline: mapping, aggregation, profiles, reports, IndexedDB
  pgn/            # PGN parser and replay runtime
  utils/          # Export (PGN/CSV/JSON/ZIP), metrics, Elo, board annotations
  App.tsx         # Main app with tab routing (Game / Tournament / Replay)
```

### Key Architecture

- **Game Runtime** (`engine/runtime.ts`) — Central game loop handling 5 player types: Stockfish, Oracle, Replay, Human, and LLM. Emits typed `GameEvent`s processed by a reducer.
- **State Management** — Zustand stores with `persist` middleware. Runtime events flow through a reducer to produce immutable `GameState` snapshots.
- **LLM Clients** — Factory pattern (`llm/client.ts`). Each provider implements `callChat()`, `requestCommentary()`, `requestCommentaryStream()`, and `listModels()`.
- **Tournament Orchestration** — `store/tournamentStore.ts` manages matches, pairs, games, auto-play sequencing, and tournament parking/persistence.
- **Commentary Pipeline** — Moves are batched and sent to the commentator LLM. Filler generation fills gaps. Optional TTS narration gates game progression.

## Code Review

A comprehensive code review covering all ~78 source files is available in [`CODE_REVIEW.md`](./CODE_REVIEW.md). It documents 65+ bugs, 25+ performance issues, 20+ DRY violations, and security concerns with line-level specificity.

## License

See [LICENSE](./LICENSE) if present.
