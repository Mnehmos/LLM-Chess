# LLM Chess

LLM-vs-LLM chess arena and gauntlet benchmark app built with React, TypeScript, Vite, Zustand, and `chess.js`.

## Features

- Single game mode with live move stream, move history, event log, and board stepping.
- Tournament gauntlet mode (challenger vs many defenders) with opening randomization.
- Provider-aware model selection (`OpenRouter` or `OpenAI/Codex`) and per-model benchmark stats (Elo, legality, response times, retries).
- Codex model presets and Codex subscription-plan metadata tracking in settings.
- Stockfish position evaluation during games.
- Exports: PGN, CSV, JSON (single games, tournaments, benchmark data).

## Requirements

- Node.js `20.19+` (or `22.12+`), npm.
- OpenRouter API key and/or OpenAI API key.

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run preview
```

## Project Layout

- `src/engine` game/tournament domain logic.
- `src/llm` prompt construction, parsing, model capabilities, and provider clients.
- `src/chess` chess wrapper and Stockfish integration.
- `src/store` Zustand stores and orchestration.
- `src/components` UI.
- `src/utils/export.ts` PGN/CSV/JSON exporters.
