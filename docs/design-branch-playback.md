# Design: Instructor Board Control (Branch Playback)

Status: **Design — pre-implementation**
Owner: next PR after London reshoot ships
Date: 2026-05-27

## Goal

Let a lesson **pause, rewind, play an alternative line on the actual board, then return to the main line**. Per the user:

> "we need the ability for the instructor to control board state with more granularity. to roll back the game and explore different ideas, etc"

This is the natural extension of `moveTangents` (ghost arrows) from PR #58: instead of just *showing* the alternative as a dashed arrow, the board actually *plays* it and *recovers*.

## Relationship to existing features

| Feature | Behavior |
|---|---|
| `moveTangents` (PR #58) | Dashed arrow on board during current ply's narration. Board state never changes. |
| **Branch playback (this PR)** | Board state DOES change. Plays N moves of a branch, then snaps back to where the main line was. |
| Whiteboard scenes (PR #68) | Board fades out; full-frame educational slate replaces it. |

A "scene" is the unifying concept: a moment where the lesson pauses for a focused interlude. Whiteboards are visual scenes; branch playback is board-state scenes.

## Schema

```ts
// New on Episode:
boardBranches?: BoardBranch[];

interface BoardBranch {
  /**
   * 1-indexed ply AFTER which the branch plays. The lesson pauses
   * after move N completes, the board rewinds to `fromPly` (often
   * just `ply` itself), then plays the branch moves.
   */
  ply: number;
  /**
   * How far to rewind before playing the branch. Default = ply
   * (= same position the main line just reached, no rewind).
   * For "what if Black had played differently 2 moves ago?" use
   * fromPly = ply - 2.
   */
  fromPly?: number;
  /**
   * SAN move sequence to play from fromPly. Validated at startup
   * against the main PGN's position.
   */
  branchMoves: string[];
  /**
   * One-line educational topic the commentator should narrate
   * during the branch. Injected into the prompt so the audio
   * matches what the board is doing.
   */
  narrationCue: string;
  /**
   * After playing the branch, snap back to this ply of the main
   * line. Default = the ply the main line was at when the branch
   * started (= no skip). For "play 4 moves of the trap line, then
   * skip ahead 2 moves in the main line" use returnToPly = ply + 2.
   */
  returnToPly?: number;
  /**
   * Wall-clock delay between each branch move (ms) so the viewer
   * can follow. Default 1500. Faster than main-line moveDelayMs
   * because the branch is dense educational content.
   */
  branchMoveDelayMs?: number;
  /**
   * Title shown briefly during the branch (e.g. "Blunder Line: 7.h3
   * d5! and Black wins material"). Optional.
   */
  title?: string;
}
```

## Visual sequence

```
[main line]  ... move N played, commentary plays ...
              ↓
[transition] board fades 50%, "BRANCH: <title>" banner slides in
              ↓
[rewind]     pieces animate back to fromPly position (250-500 ms ease)
              ↓
[branch]     branchMoves[0], branchMoves[1], ... play with branchMoveDelayMs
              accompanying narration from the commentator (narrationCue)
              ↓
[return]     pieces animate to returnToPly position
              ↓
[resume]     banner slides out, board returns to 100% opacity
              ↓
[main line]  next move of the main line plays
```

## Engine changes

Currently the replay runtime is fed a single linear PGN via `startReplay(pgnText)`. It plays moves sequentially with a `replayPaceCheck` callback to coordinate narration.

New mechanism: a **branch director** that sits between the runtime and the playback loop.

```
┌─────────────────────────────────────────────────────────┐
│  GameRuntime (replay mode)                              │
│                                                          │
│  Existing flow:                                         │
│    PGN moves → playMove → state → MoveApplied event     │
│                                                          │
│  New flow:                                              │
│    [main line move N] → check branch director          │
│      ├─ no branch at ply N → continue as before        │
│      └─ branch at ply N → pause main, run branch,      │
│                            then resume main             │
└─────────────────────────────────────────────────────────┘
```

The branch director is implemented at the **runtime layer**, not in the replay-pace callback, so the state machine stays clean.

### State changes

`GameRuntime` needs:
- `inBranch: boolean` — gates main-line advancement during a branch
- `branchStack: BranchFrame[]` — supports nested branches (probably YAGNI for v1)
- `mainLineFen: string` — saved position to restore after the branch
- Event types: `BranchStarted`, `BranchMoveApplied`, `BranchEnded`

### Why not just emit MoveApplied for branch moves?

Because the consumers (BroadcastLayout, recent moves panel, commentary log) would treat the branch moves as part of the main game history. The lesson's "Move 8" wouldn't make sense if a branch played 4 moves between moves 7 and 8.

`BranchMoveApplied` is a sibling event with its own move counter. The reducer:
- Keeps `mainHistory: MoveRecord[]` (unchanged)
- Adds `currentBranchMoves: MoveRecord[]` (empty when not in a branch)
- `displayedFen` switches to `currentBranchFen` while in branch, then back

### Position management

```ts
// Pseudocode for the runtime branch director:
async function executeBranch(branch: BoardBranch, currentPly: number) {
  const mainFen = currentFen;
  const mainEvtLog = events;

  // Rewind: load FEN before `fromPly` (or current if fromPly == ply)
  const rewindTarget = branch.fromPly ?? currentPly;
  if (rewindTarget < currentPly) {
    const fen = pgnMoves[rewindTarget - 1].fen;  // FEN AFTER move rewindTarget
    emit({ type: 'BranchStarted', payload: { fromPly: rewindTarget, title: branch.title } });
    emit({ type: 'BranchPositionSet', payload: { fen } });
  } else {
    emit({ type: 'BranchStarted', payload: { fromPly: currentPly, title: branch.title } });
  }

  // Play each branch move
  const chess = new Chess(fen);
  for (const san of branch.branchMoves) {
    const move = chess.move(san);
    emit({ type: 'BranchMoveApplied', payload: { san, from: move.from, to: move.to, fen: chess.fen() } });
    await sleep(branch.branchMoveDelayMs ?? 1500);
    await waitForNarrationGate();  // same gating as main line
  }

  // Restore main line position
  const returnTarget = branch.returnToPly ?? currentPly;
  const returnFen = returnTarget === 0
    ? STARTING_FEN
    : pgnMoves[returnTarget - 1].fen;
  emit({ type: 'BranchEnded', payload: { resumeFen: returnFen, resumePly: returnTarget } });
}
```

## Commentator integration

The branch needs narration that matches what the board is doing. The commentator queue gets a new entry kind:

```ts
// In CommentaryQueue:
generateBranchCommentary(spec: {
  branchMoves: string[];
  narrationCue: string;
  position: string;  // FEN at branch start
}): Promise<void>;
```

This produces a single narrated block covering all branch moves (not move-by-move). The viewer hears one continuous explanation while the board plays the branch.

Alternative (more work, better quality): generate per-branch-move commentary like the main line. Defer to v2.

## Authoring example: Italian Game

```ts
const ITALIAN_BOARD_BRANCHES: BoardBranch[] = [
  {
    ply: 11,  // After 6.O-O (White's 6th move)
    fromPly: 11,
    title: "What if White played Bxf7+ instead?",
    branchMoves: ['Bxf7+', 'Kxf7', 'Ng5+', 'Kg8', 'Qh5', 'g6'],
    returnToPly: 11,
    narrationCue:
      "Take 4 moves to show what happens if White sacrifices the bishop on f7 here. Note that Black's king walks but White has no follow-up — Black is just up a piece.",
    branchMoveDelayMs: 1800,
  },
  // ...
];
```

The screen sequence:
1. Main line: 6.O-O O-O is played, commentary covers the castle.
2. Pause; banner: "BRANCH: What if White played Bxf7+ instead?"
3. Board rewinds to position after 6.O-O (no rewind needed here — same position).
4. Branch plays: 6.Bxf7+ Kxf7 7.Ng5+ Kg8 8.Qh5 g6 (with branch commentary playing).
5. Board snaps back to position after 6.O-O O-O.
6. Banner clears; commentary resumes with 7.Nbd2 (next main-line move).

## Test plan

1. **Smoke**: 1 branch on Italian Game at ply 11 (Bxf7+ trap line). Verify visually that the board rewinds, plays the branch, and returns.
2. **No-flag default**: episodes WITHOUT `boardBranches` capture identically to current behavior.
3. **With-flag** (consider adding `?branches=1` to opt in for v1 captures): same episodes with branches authored produce a longer video with the branches.
4. **Multiple branches**: 2 branches in the same episode, no overlap.
5. **Nested handling**: skip for v1; document as future work.

## Estimated scope

| Piece | LoC | Risk |
|---|---|---|
| Schema + types | ~80 | Low |
| Runtime branch director | ~250 | High (touches GameRuntime state machine) |
| Event types + reducer | ~120 | Medium |
| BroadcastLayout — branch banner + faded board | ~80 | Low |
| Commentator branch entry | ~150 | Medium (touches CommentaryQueue) |
| Authoring on Italian (1-2 branches) | ~50 | Low |

**Total: ~750 LoC, mostly engine.** ~2-3 days focused work.

## Open questions

1. **Branch-mode TTS pacing**: does narration drive the branch move advance (like main line), or does the branch play at its own fixed pace? Recommend: keep narration-gated for consistency.
2. **Eval bar during branch**: show Stockfish eval of the branch position, or freeze at main-line eval? Recommend: show branch eval (it's part of the educational point — "see how the eval drops here").
3. **Recent moves panel**: include branch moves, or only main-line moves? Recommend: branch moves shown with a "[BRANCH]" prefix, removed when branch ends.
4. **What if the branch reaches checkmate?**: do we celebrate or just return? Recommend: pause briefly to acknowledge, then return.

## Non-goals (v1)

- **Nested branches**: a branch within a branch. Defer.
- **Interactive branching**: viewer-driven choice of which branch to play. This is a published video, not a UI.
- **PGN export of branches**: the rendered MP4 includes them; the PGN stays the main line. Defer authoring this if needed.
- **Branch playback from the main app (non-broadcast)**: only ships behind the broadcast flag.
