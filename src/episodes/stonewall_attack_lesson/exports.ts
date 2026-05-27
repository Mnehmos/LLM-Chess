import type { EpisodeExportConfig } from '../types';
import { STONEWALL_VARIATIONS } from './variations';

export const STONEWALL_ATTACK_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode stonewall_attack_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    'An AI walks through the Stonewall Attack (classical main line), playing both sides through the f4-Bd3-Qh4 kingside assault that defines this attacking system opening. Part of Oracle Trust Calibration.',
  ],
  shorts: [],
  variations: STONEWALL_VARIATIONS,
};
