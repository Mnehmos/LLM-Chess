# Match Histories

This directory stores exported single-game and tournament JSON histories that are intended to live in the repository.

Conventions:

- Group files by date in `YYYY-MM-DD/`
- Preserve the original export filename so the UI export and the archived file are easy to correlate
- Treat these files as immutable run artifacts unless a redaction is required

Notes on reasoning data:

- Exports include move-by-move stated reasoning text, commentary, timing, and token usage fields
- `reasoningTokens` is numeric accounting reported by the provider/client path
- Hidden internal chain-of-thought text is only present if the provider exposes it explicitly; otherwise the archive will contain counts, not hidden trace text
