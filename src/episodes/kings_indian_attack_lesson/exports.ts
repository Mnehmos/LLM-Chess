import type { EpisodeExportConfig } from '../types';
import { KIA_VARIATIONS } from './variations';

export const KIA_LESSON_EXPORT: EpisodeExportConfig = {
  command: 'npm run export:game -- --episode kings_indian_attack_lesson',
  outputRoot: 'exports',
  descriptionCandidates: [
    "An AI walks through the King's Indian Attack (KIA) — the King's Indian Defense played by White with a tempo up. Bobby Fischer's signature anti-French weapon. Part of Oracle Trust Calibration.",
  ],
  shorts: [],
  variations: KIA_VARIATIONS,
};
