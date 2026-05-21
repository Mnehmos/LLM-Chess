import type { EpisodeExportConfig } from '../types';
import { LONDON_VARIATIONS } from './variations';

export const LONDON_SYSTEM_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode london_system_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the London System (Classical Bf4 setup), playing both sides through the system-opening philosophy that made it the most popular club opening of the 2020s. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: LONDON_VARIATIONS,
};
