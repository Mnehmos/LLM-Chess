/**
 * Episode contract — the catalog entry for one published LLM Chess
 * historic-game review video.
 *
 * The shape is intentionally parallel to Clio's `Artifact`:
 * a typed product (PGN + commentator config + export plan + lifecycle)
 * that the export pipeline compiles down to one full-length video and
 * zero or more vertical Shorts.
 *
 * Two production paths converge on the same Episode shape via the
 * `source` field:
 *
 *   `public_domain`   game from the historic public-domain corpus
 *                     (Morphy, pre-1923 tournament games, etc.)
 *   `licensed`        game from a licensed/curated source (modern
 *                     tournament with permission, study material)
 *   `agent_generated` an LLM-vs-LLM game we want to publish (output of
 *                     the existing arena/tournament runtime)
 *
 * The capture pipeline (added in a later PR) does not need to know
 * which path produced the PGN — it just consumes the Episode.
 */

export interface Episode {
  /** Stable identifier (lowercase, underscored). Matches `exports/<id>/`. */
  id: string;
  /** Display title used in the UI and on the published video. */
  title: string;
  /** One-paragraph summary for catalog views and the YouTube description. */
  summary: string;
  /** Where the underlying game came from. */
  source: EpisodeSource;
  /** Full PGN text including headers. */
  pgn: string;
  /** Commentator LLM config — model, voice, system-prompt overrides. */
  commentator: EpisodeCommentatorConfig;
  /**
   * Historical context injected into the commentator system prompt so it
   * has dates, tournament names, player background, and any quirks worth
   * narrating without having to recall them.
   *
   * Mutually exclusive with `commentator.lessonContext` — episodes that
   * set the lesson context use the teacher prompt builder instead.
   */
  historicalContext?: string;
  /** Export configuration. Present once the episode is planned for export. */
  exports?: EpisodeExportConfig;
  /** Published references (e.g. YouTube URLs). Workspace-tracked. */
  published?: EpisodePublishedRef[];
}

/** Provenance of the PGN that backs the Episode. */
export type EpisodeSource = 'public_domain' | 'licensed' | 'agent_generated';

/** Lifecycle stages an Episode moves through. Derived from data, not stored. */
export type EpisodeLifecycle = 'draft' | 'scripted' | 'exported' | 'published';

/**
 * Commentator config attached to an Episode. The default for the channel is
 * `DEFAULT_COMMENTATOR` below; per-episode overrides only when a specific
 * game intentionally wants a different style.
 */
export interface EpisodeCommentatorConfig {
  /**
   * LLM provider key. Must match a provider registered in `src/llm/client.ts`
   * (today: `'openai' | 'openrouter' | 'ollama' | 'codex'`).
   */
  provider: string;
  /**
   * Model identifier as accepted by the provider client. For OpenAI this is
   * the canonical model id (e.g. the GPT 5.5 release identifier registered
   * in `model-capabilities.ts`).
   */
  model: string;
  /**
   * Optional TTS voice id. Used by the OpenAI TTS path; ignored by other
   * providers.
   */
  voice?: string;
  /**
   * Optional system-prompt addition merged into the commentator's base
   * prompt. Use this for per-episode framing (e.g. era-specific tone) when
   * the global commentator system prompt is not enough.
   */
  systemPromptAddition?: string;
  /**
   * Lesson context — when set, the commentator uses a TEACHER voice
   * (first-person, "I'm playing X because Y") via
   * getLessonCommentatorPrompt instead of the historical narrator voice.
   * Use this for "AI teaches X opening" episodes. Mutually exclusive
   * with the Episode-level historicalContext field.
   */
  lessonContext?: string;
}

/**
 * One short to slice from an Episode's full video. Mirrors the
 * `ClipManifestEntry` shape on the Clio side, but ranges are expressed in
 * chess move numbers (1-indexed full moves) rather than script segment
 * indices, since chess content is naturally addressable by move.
 */
export interface EpisodeShortClip {
  id: string;
  /** First full-move number (1-indexed) covered by the short. Inclusive. */
  startMoveNumber: number;
  /** Last full-move number covered by the short. Inclusive. */
  endMoveNumber: number;
  /** Hook line for thumbnails / metadata. */
  hook: string;
  /** Payoff/CTA line. */
  payoff: string;
  cta?: string;
  /** Target duration in seconds (used for pacing, not a hard cap). */
  durationTargetSec: number;
  /** Free-form visual requirements for human review (e.g. "show the bishop sac"). */
  visualRequirements?: string[];
}

/** Export configuration attached to an Episode. */
export interface EpisodeExportConfig {
  /** npm script that exports this episode end-to-end. */
  command: string;
  /** Output root for rendered files (typically `'exports'`). */
  outputRoot: string;
  /** Candidate descriptions for the published video (YouTube etc.). */
  descriptionCandidates: string[];
  /** Shorts to slice from the full video. */
  shorts: EpisodeShortClip[];
}

/** A published reference for an Episode (e.g. a YouTube upload). */
export interface EpisodePublishedRef {
  platform: 'youtube' | string;
  url: string;
  publishedAt: string;
  format: 'full' | 'short';
  /** Required when `format === 'short'`; must match a short id in the export config. */
  shortId?: string;
  notes?: string;
}

/**
 * Channel-default commentator. Picked once and locked so episodes have a
 * recognizable voice across uploads.
 *
 * NOTE on the model identifier: the canonical OpenAI id for GPT 5.5 is
 * registered alongside the rest of the model catalog in
 * `src/llm/model-capabilities.ts`. If the id shifts (renames, version bumps),
 * keep this default in sync.
 */
export const DEFAULT_COMMENTATOR: EpisodeCommentatorConfig = {
  provider: 'openai',
  model: 'gpt-5.5',
  voice: 'nova',
};

/** Derive the current lifecycle stage from an Episode's data. */
export function episodeLifecycle(episode: Episode): EpisodeLifecycle {
  if (!episode.pgn.trim()) return 'draft';
  if (!episode.exports) return 'scripted';
  if (episode.published && episode.published.length > 0) return 'published';
  return 'exported';
}
