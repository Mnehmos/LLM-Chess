import type { EpisodeExportConfig } from '../types';
import { KINGS_INDIAN_VARIATIONS } from './variations';

export const KINGS_INDIAN_CLASSICAL_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode kings_indian_classical_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the King's Indian Defense (Classical / Mar del Plata main line), playing both sides through the d5 push and the opposite-wing pawnstorm race that defines the opening. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: KINGS_INDIAN_VARIATIONS,
};
