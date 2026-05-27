import type { EpisodeExportConfig } from '../types';
import { KINGS_INDIAN_VARIATIONS } from './variations';

export const KINGS_INDIAN_CLASSICAL_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode kings_indian_classical_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "A black-side King's Indian Defense walkthrough covering the setup, the Classical / Mar del Plata main line, and the opposite-wing pawnstorm race that defines the opening. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: KINGS_INDIAN_VARIATIONS,
};
