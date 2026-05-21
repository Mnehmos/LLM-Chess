import type { EpisodeExportConfig } from '../types';
import { CATALAN_VARIATIONS } from './variations';

export const CATALAN_OPEN_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode catalan_open_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Catalan Opening (Open Defense main line), playing both sides through the c4 pawn grab, the Bg2 fianchetto pressure, and the patient queen recovery dance that defines the opening. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: CATALAN_VARIATIONS,
};
