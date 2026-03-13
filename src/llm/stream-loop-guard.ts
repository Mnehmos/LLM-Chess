const MAX_TRACKED_TOKENS = 288;
const WINDOW_SIZES = [12, 18, 24, 32];
const SIMILARITY_THRESHOLD = 0.9;
const REQUIRED_STRIKES = 2;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9+#=:-]+/g) ?? [];
}

function similarity(a: string[], b: string[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let matches = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[i] === b[i]) matches += 1;
  }
  return matches / len;
}

export class StreamLoopGuard {
  private tokens: string[] = [];
  private strikes = 0;

  push(chunk: string): boolean {
    const next = tokenize(chunk);
    if (next.length === 0) return false;
    this.tokens.push(...next);
    if (this.tokens.length > MAX_TRACKED_TOKENS) {
      this.tokens.splice(0, this.tokens.length - MAX_TRACKED_TOKENS);
    }

    const suspicious = this.isSuspicious();
    this.strikes = suspicious ? this.strikes + 1 : Math.max(0, this.strikes - 1);
    return this.strikes >= REQUIRED_STRIKES;
  }

  private isSuspicious(): boolean {
    for (const windowSize of WINDOW_SIZES) {
      if (this.tokens.length < windowSize * 3) continue;
      const last = this.tokens.slice(-windowSize);
      const prev = this.tokens.slice(-windowSize * 2, -windowSize);
      const prevPrev = this.tokens.slice(-windowSize * 3, -windowSize * 2);
      if (
        similarity(last, prev) >= SIMILARITY_THRESHOLD &&
        similarity(prev, prevPrev) >= SIMILARITY_THRESHOLD
      ) {
        return true;
      }
    }
    return false;
  }
}
