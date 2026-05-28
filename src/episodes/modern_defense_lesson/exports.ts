import type { EpisodeExportConfig } from '../types';
import { MODERN_DEFENSE_VARIATIONS } from './variations';

export const MODERN_DEFENSE_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode modern_defense_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the Modern Defense (Tiger's Modern main line) — Black's most flexible system opening. Slow queenside expansion, no theory burden, lots of hypermodern flexibility. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: MODERN_DEFENSE_VARIATIONS,
};
