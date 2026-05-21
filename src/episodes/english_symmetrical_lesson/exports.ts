import type { EpisodeExportConfig } from '../types';
import { ENGLISH_VARIATIONS } from './variations';

export const ENGLISH_SYMMETRICAL_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode english_symmetrical_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the English Opening (Symmetrical Variation), playing both sides through the double fianchetto and the queenside expansion race that defines the most transpositional opening in chess. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: ENGLISH_VARIATIONS,
};
