import type { ConstraintConfig, MoveSource, PieceColor, TimeoutBehavior } from './types';

/**
 * GameClock — tracks remaining time per player with optional Fischer increment.
 */
export class GameClock {
  private remaining: { w: number; b: number };
  private incrementMs: number;
  private turnStart: number | null = null;
  private activeColor: PieceColor | null = null;

  constructor(totalMs: number, incrementMs: number = 0) {
    this.remaining = { w: totalMs, b: totalMs };
    this.incrementMs = incrementMs;
  }

  startTurn(color: PieceColor): void {
    this.activeColor = color;
    this.turnStart = Date.now();
  }

  endTurn(color: PieceColor): void {
    if (this.turnStart !== null && this.activeColor === color) {
      const elapsed = Date.now() - this.turnStart;
      this.remaining[color] = Math.max(0, this.remaining[color] - elapsed + this.incrementMs);
      this.turnStart = null;
      this.activeColor = null;
    }
  }

  getRemainingMs(color: PieceColor): number {
    if (this.activeColor === color && this.turnStart !== null) {
      const elapsed = Date.now() - this.turnStart;
      return Math.max(0, this.remaining[color] - elapsed);
    }
    return this.remaining[color];
  }

  isExpired(color: PieceColor): boolean {
    return this.getRemainingMs(color) <= 0;
  }

  getSnapshot(): { whiteRemainingMs: number; blackRemainingMs: number } {
    return {
      whiteRemainingMs: this.getRemainingMs('w'),
      blackRemainingMs: this.getRemainingMs('b'),
    };
  }
}

/**
 * ConstraintEnforcer — wraps LLM calls with wall-clock timeout enforcement
 * and provides token budget calculations.
 */
export class ConstraintEnforcer {
  /**
   * Enforce a wall-clock timeout on a promise.
   * Returns the result or applies the timeout behavior (forfeit/random_legal/best_effort).
   */
  static async enforceWallClock<T>(
    promise: Promise<T>,
    limitMs: number,
    timeoutBehavior: TimeoutBehavior,
    legalMoves: string[],
    getPartialContent?: () => string,
  ): Promise<{ result: T; timedOut: false } | { timedOut: true; moveSource: MoveSource; move: string | null; violation: string }> {
    let timer: ReturnType<typeof setTimeout>;

    const timeout = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => resolve('TIMEOUT'), limitMs);
    });

    const race = await Promise.race([
      promise.then((r) => ({ type: 'result' as const, value: r })),
      timeout.then(() => ({ type: 'timeout' as const })),
    ]);

    clearTimeout(timer!);

    if (race.type === 'result') {
      return { result: race.value, timedOut: false };
    }

    // Timeout occurred — apply behavior
    const violation = `Wall clock timeout after ${limitMs}ms`;

    switch (timeoutBehavior) {
      case 'forfeit':
        return { timedOut: true, moveSource: 'forfeit', move: null, violation };

      case 'random_legal': {
        const randomMove = legalMoves.length > 0
          ? legalMoves[Math.floor(Math.random() * legalMoves.length)]
          : null;
        return { timedOut: true, moveSource: 'random_legal', move: randomMove, violation };
      }

      case 'best_effort': {
        // Try to extract a move from partial streamed content
        const partial = getPartialContent?.() || '';
        if (partial) {
          return { timedOut: true, moveSource: 'best_effort', move: partial, violation };
        }
        // Fall back to random if no partial content
        const fallbackMove = legalMoves.length > 0
          ? legalMoves[Math.floor(Math.random() * legalMoves.length)]
          : null;
        return { timedOut: true, moveSource: 'random_legal', move: fallbackMove, violation };
      }
    }
  }

  /**
   * Compute the effective wall-clock limit for a move, considering both
   * per-move timeout and game clock remaining.
   */
  static getEffectiveWallClockLimit(
    constraints: ConstraintConfig | undefined,
    gameClockRemainingMs?: number,
  ): number | undefined {
    if (!constraints) return undefined;

    const limits: number[] = [];
    if (constraints.wallClockPerMoveMs) limits.push(constraints.wallClockPerMoveMs);
    if (gameClockRemainingMs !== undefined && gameClockRemainingMs > 0) {
      limits.push(gameClockRemainingMs);
    }

    return limits.length > 0 ? Math.min(...limits) : undefined;
  }

  /**
   * Clamp a token budget to the constraint's output/reasoning limits.
   */
  static getEffectiveTokenBudget(
    constraints: ConstraintConfig | undefined,
    baseBudget: number,
  ): { outputTokens: number; reasoningTokens?: number } {
    if (!constraints) return { outputTokens: baseBudget };

    const outputTokens = constraints.outputTokenBudget
      ? Math.min(baseBudget, constraints.outputTokenBudget)
      : baseBudget;

    return {
      outputTokens,
      reasoningTokens: constraints.reasoningTokenBudget,
    };
  }
}
