import type { EpisodeExportConfig } from '../types';
import { ITALIAN_GAME_VARIATIONS } from './variations';

/**
 * Export configuration for the Italian Game lesson.
 *
 * Track A model:
 *   - The long-form is captured from the main PGN with the teacher voice.
 *   - `shorts: []` — Track A does NOT slice the main video; instead each
 *     line variation is captured as its own portrait Short with its own
 *     PGN (`variations`). Pipeline wiring lives in scripts/export-chess-mp4.
 *   - The long-form's "futures" segment teases the variation titles, so
 *     the long-form and the Shorts work as a coherent content cluster.
 */
export const ITALIAN_GAME_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode italian_game_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Italian Game (Giuoco Piano main line), playing both sides of a 12-move demonstration and explaining each idea in real time. Part of Oracle Trust Calibration — a research show using chess to benchmark how LLMs behave under unreliable context.',
  ],
  shorts: [],
  variations: ITALIAN_GAME_VARIATIONS,
};
