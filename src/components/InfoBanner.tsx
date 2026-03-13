import { useState, useEffect, useRef } from 'react';
import type { PlayerConfig } from '../engine/types';

export interface InfoBannerProps {
  white: PlayerConfig;
  black: PlayerConfig;
  /** Current thinking model name (for live "thinking..." indicator). */
  thinkingModel?: string;
  /** How long the current player has been thinking (ms). */
  thinkingElapsedMs?: number;
}

function formatEffort(effort?: string): string {
  if (!effort || effort === 'off') return 'No reasoning';
  if (effort === 'low') return 'Low reasoning';
  if (effort === 'med') return 'Medium reasoning';
  if (effort === 'high') return 'High reasoning';
  if (effort === 'max') return 'Max reasoning ⚡';
  return effort;
}

function formatTokens(tokens?: number): string {
  if (!tokens) return '6k tokens';
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k tokens`;
  return `${tokens} tokens`;
}

function buildItems(white: PlayerConfig, black: PlayerConfig): string[] {
  return [
    `⚪ ${white.displayName} — ${formatEffort(white.reasoningEffort)} — ${formatTokens(white.maxTokens)}`,
    `⚫ ${black.displayName} — ${formatEffort(black.reasoningEffort)} — ${formatTokens(black.maxTokens)}`,
    '🤖 AI models may make mistakes — moves are not validated for correctness, only legality',
    '📊 Powered by LLM Chess Arena — pure calculation, no human assistance',
    '♟️ Opening moves played from a standard chess opening library',
    '🔬 All models play under identical time and token conditions',
    `⚪ White: ${white.model}`,
    `⚫ Black: ${black.model}`,
    '💡 Chess engines like Stockfish evaluate positions in centipawns (100cp = 1 pawn advantage)',
    '🎯 Follow along at home — can you spot the best move before the AI does?',
  ].filter(Boolean);
}

const ROTATE_INTERVAL_MS = 7000;

export function InfoBanner({ white, black, thinkingModel, thinkingElapsedMs }: InfoBannerProps) {
  const items = buildItems(white, black);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      // Fade out, advance, fade in
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % items.length);
        setVisible(true);
      }, 400);
    }, ROTATE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  const elapsedSec = thinkingElapsedMs ? Math.round(thinkingElapsedMs / 1000) : 0;
  const showThinking = !!thinkingModel && elapsedSec >= 5;

  return (
    <div className="w-full flex flex-col gap-1">
      {/* Thinking indicator — always shown when active */}
      {showThinking && (
        <div className="bg-accent/10 border border-accent/30 rounded px-3 py-1.5 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-accent font-medium">
            {thinkingModel} is thinking… {elapsedSec}s
          </span>
        </div>
      )}

      {/* Rotating info banner */}
      <div
        className="bg-surface-1 border border-border rounded px-3 py-1.5 overflow-hidden"
        style={{ transition: 'opacity 0.35s ease', opacity: visible ? 1 : 0 }}
      >
        <p className="text-xs text-text-muted truncate">{items[index]}</p>
      </div>
    </div>
  );
}
