import type { EpisodeExportConfig } from '../types';
import { COLLE_VARIATIONS } from './variations';

export const COLLE_SYSTEM_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode colle_system_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the Colle System (Colle-Koltanowski main line), playing both sides through the e3-e4 break that defines this classic positional system. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: COLLE_VARIATIONS,
};
