import type { EpisodeExportConfig } from '../types';
import { SCOTCH_VARIATIONS } from './variations';

export const SCOTCH_GAME_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode scotch_game_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the Scotch Game (Classical Variation), playing both sides through the d4 central trade that defines Kasparov's anti-Ruy weapon. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: SCOTCH_VARIATIONS,
};
