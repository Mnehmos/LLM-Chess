import type { EpisodeExportConfig } from '../types';
import { CARO_KANN_VARIATIONS } from './variations';

export const CARO_KANN_CLASSICAL_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode caro_kann_classical_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Caro-Kann Defense (Classical Variation), playing both sides through the bishop trade on h7 and explaining the structural tradeoffs vs the French Defense. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: CARO_KANN_VARIATIONS,
};
