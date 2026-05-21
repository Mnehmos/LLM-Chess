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
  /**
   * Content track. Drives the Shorts production model:
   *  - 'lesson':     long-form "AI Teaches X" — Shorts are LINE VARIATIONS
   *                  (each with its own self-contained PGN in
   *                  `exports.variations`).
   *  - 'historical': long-form "AI Reviews [game]" — Shorts are KEY MOMENTS
   *                  sliced from the main PGN by move range
   *                  (in `exports.shorts`).
   *
   * Both tracks share the Oracle Trust Calibration brand and the same
   * intro/outro scaffold; only the body voice (teacher vs. historian)
   * and the Shorts shape differ.
   */
  track: 'lesson' | 'historical';
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
  /**
   * The opening's BOOK STANDARD — what each side is trying to achieve,
   * what counts as a successful opening for each color, and the
   * principles that "hold the line" (i.e. the moves and ideas considered
   * mainstream good play). Track A only.
   *
   * Read into the lesson commentator's system prompt and stated near
   * the top of the lesson so the viewer knows the WIN CONDITION the
   * opening targets before move-by-move teaching begins.
   *
   * Example: "Ruy Lopez book standard — White: develop, pin the c6
   * knight, hold the long Spanish bishop diagonal, play c3/d4 at the
   * right moment. Black: free the position with ...a6/...b5/...d6,
   * solve the c8-bishop, time the ...c5 break. Each side wants a
   * playable middlegame with their own structural priorities intact."
   */
  bookStandard?: string;
  /**
   * Per-move tangents — ALTERNATIVE moves the lesson can teach about
   * (typically blunders or sub-variations) WITHOUT actually playing
   * them on the board. The board renders these as ghosted arrows
   * during the narration of the relevant ply, so the viewer sees
   * "what could have happened" while the lesson stays on the main line.
   * Track A only.
   *
   * The commentator's prompt for each move surfaces the matching
   * tangents so it can weave them into narration ("If Black plays Nf6
   * here, that's a typical student mistake because…").
   */
  moveTangents?: MoveTangent[];
  /** Export configuration. Present once the episode is planned for export. */
  exports?: EpisodeExportConfig;
  /** Published references (e.g. YouTube URLs). Workspace-tracked. */
  published?: EpisodePublishedRef[];
}

/**
 * A per-move ALTERNATIVE move shown as a ghost arrow on the board while
 * the lesson narrates the main move. Doesn't replay the line — the
 * board stays on the main PGN, but the alternative move is rendered
 * with a translucent / dashed arrow so the viewer sees what was
 * considered.
 *
 * `category` drives the arrow's styling so different kinds of
 * alternatives are visually distinguishable.
 */
export interface MoveTangent {
  /**
   * Which move in the main PGN this tangent applies to. 1-indexed ply
   * counter: 1 = White's first move, 2 = Black's first move, etc.
   * The tangent shows on the board while THIS move's commentary plays.
   */
  ply: number;
  /**
   * The alternative move in SAN (e.g. "Nf6"). Resolved at render time
   * to from/to squares against the board's position just BEFORE the
   * main move at this ply was played.
   */
  san: string;
  /**
   * Category — drives the ghost arrow's color / style:
   *   'student_mistake'    — common club-level error
   *   'move_order_trap'    — looks fine but loses to a known trap
   *   'engine_refutation'  — natural-looking move that engines refute
   *   'historical_blunder' — a real-game blunder by a named player
   */
  category: 'student_mistake' | 'move_order_trap' | 'engine_refutation' | 'historical_blunder';
  /**
   * One-line teaching note for the commentator. Read into the prompt
   * for this ply so the LLM can mention the tangent ("if Black plays X
   * here, that's because <note>").
   */
  note: string;
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
  /**
   * Move-range clips of the main PGN. Used for Track B (historical) Shorts
   * where a key moment from the long-form game becomes a 30–60s vertical clip.
   * Empty for Track A lessons, which use `variations` instead.
   */
  shorts: EpisodeShortClip[];
  /**
   * Line-variation Shorts for Track A (lesson) episodes. Each entry is a
   * self-contained mini-lesson with its own PGN, lesson context, and
   * commentator framing — NOT a slice of the main PGN. Captured as
   * portrait MP4s alongside the long-form.
   */
  variations?: VariationShort[];
}

/**
 * A line-variation Short for a Track A lesson. Unlike `EpisodeShortClip`
 * (which slices the main PGN by move range), a variation has its OWN PGN
 * showing an alternative continuation from a shared root position. The
 * long-form lesson's "futures" segment tees up the variations; each
 * variation Short delivers one of them as a 60–90s portrait clip.
 */
export interface VariationShort {
  /** Stable id, namespaced under the parent episode (e.g. 'italian_evans_gambit'). */
  id: string;
  /** Display title (e.g. 'Italian Game: Evans Gambit'). */
  title: string;
  /** Full PGN of the variation, including headers. Self-contained. */
  pgn: string;
  /**
   * Teacher-voice framing for this specific variation. Spliced into the
   * lesson commentator prompt so the model knows what idea this line is
   * demonstrating (e.g. "Evans Gambit — White sacrifices a pawn for
   * rapid development and central control").
   */
  lessonContext: string;
  /** One-line summary for the YouTube short description. */
  summary: string;
  /** Hook line for thumbnails / first sentence of narration. */
  hook: string;
  /** Target duration in seconds. Soft target, not enforced. */
  durationTargetSec: number;
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
