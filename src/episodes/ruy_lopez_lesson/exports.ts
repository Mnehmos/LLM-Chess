import type { EpisodeExportConfig } from '../types';
import { RUY_LOPEZ_VARIATIONS } from './variations';

export const RUY_LOPEZ_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode ruy_lopez_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Ruy Lopez (Closed Defense main line), playing both sides and explaining each idea in real time. Part of Oracle Trust Calibration — a research show using chess to benchmark how LLMs behave under unreliable context.',
  ],
  shorts: [],
  variations: RUY_LOPEZ_VARIATIONS,
};
