import type { EpisodeExportConfig } from '../types';
import { VIENNA_VARIATIONS } from './variations';

export const VIENNA_GAMBIT_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode vienna_gambit_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Vienna Game (Vienna Gambit main line), playing both sides through the f4 thrust and the Falkbeer-style central counter that defines this anti-theory 1.e4 weapon. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: VIENNA_VARIATIONS,
};
