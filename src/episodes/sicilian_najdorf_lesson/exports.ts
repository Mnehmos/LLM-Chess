import type { EpisodeExportConfig } from '../types';
import { SICILIAN_NAJDORF_VARIATIONS } from './variations';

export const SICILIAN_NAJDORF_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode sicilian_najdorf_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Sicilian Defense (Najdorf Variation, English Attack), playing both sides and explaining each idea in real time. Part of Oracle Trust Calibration — a research show using chess to benchmark how LLMs behave under unreliable context.',
  ],
  shorts: [],
  variations: SICILIAN_NAJDORF_VARIATIONS,
};
