import type { EpisodeExportConfig } from '../types';
import { FRENCH_WINAWER_VARIATIONS } from './variations';

export const FRENCH_WINAWER_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode french_winawer_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the French Defense (Winawer Variation main line), playing both sides and explaining the structural bargain — Black's queenside outpost vs White's bishop pair and kingside attack — in real time. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: FRENCH_WINAWER_VARIATIONS,
};
