import type { EpisodeExportConfig } from '../types';
import { KINGS_GAMBIT_VARIATIONS } from './variations';

export const KINGS_GAMBIT_ACCEPTED_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode kings_gambit_accepted_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the King's Gambit Accepted (Modern Defense), playing both sides through the f-pawn sacrifice and the romantic-era attacking ideas that defined 19th-century chess. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: KINGS_GAMBIT_VARIATIONS,
};
