import type { EpisodeExportConfig } from '../types';
import { QGD_ORTHODOX_VARIATIONS } from './variations';

export const QGD_ORTHODOX_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode qgd_orthodox_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the Queen's Gambit Declined (Orthodox Defense), playing both sides through the Capablanca freeing maneuver and explaining the structural tradeoffs of 1.d4 chess. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: QGD_ORTHODOX_VARIATIONS,
};
