import type { EpisodeExportConfig } from '../types';
import { NIMZO_INDIAN_VARIATIONS } from './variations';

export const NIMZO_INDIAN_CLASSICAL_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode nimzo_indian_classical_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the Nimzo-Indian Defense (Classical / Capablanca Variation), playing both sides through the Bb4 pin, the bishop trade on c3, and the structural bargain that defines Nimzowitsch's invention. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: NIMZO_INDIAN_VARIATIONS,
};
