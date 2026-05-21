import { OPERA_GAME_EPISODE } from './opera_game_morphy_1858';
import { ITALIAN_GAME_LESSON_EPISODE } from './italian_game_lesson';
import { RUY_LOPEZ_LESSON_EPISODE } from './ruy_lopez_lesson';
import { SICILIAN_NAJDORF_LESSON_EPISODE } from './sicilian_najdorf_lesson';
import { FRENCH_WINAWER_LESSON_EPISODE } from './french_winawer_lesson';
import { QGD_ORTHODOX_LESSON_EPISODE } from './qgd_orthodox_lesson';
import { CARO_KANN_CLASSICAL_LESSON_EPISODE } from './caro_kann_classical_lesson';
import { KINGS_INDIAN_CLASSICAL_LESSON_EPISODE } from './kings_indian_classical_lesson';
import { NIMZO_INDIAN_CLASSICAL_LESSON_EPISODE } from './nimzo_indian_classical_lesson';
import { CATALAN_OPEN_LESSON_EPISODE } from './catalan_open_lesson';
import { ENGLISH_SYMMETRICAL_LESSON_EPISODE } from './english_symmetrical_lesson';
import { SCOTCH_GAME_LESSON_EPISODE } from './scotch_game_lesson';
import { VIENNA_GAMBIT_LESSON_EPISODE } from './vienna_gambit_lesson';
import { KINGS_GAMBIT_ACCEPTED_LESSON_EPISODE } from './kings_gambit_accepted_lesson';
import { LONDON_SYSTEM_LESSON_EPISODE } from './london_system_lesson';
import type { Episode, EpisodeSource } from './types';

/**
 * All registered Chess Episodes in display order.
 *
 * Adding an episode: build its directory under `src/episodes/<id>/` and
 * append the exported `*_EPISODE` constant here.
 */
export const CHESS_EPISODES: Episode[] = [
  OPERA_GAME_EPISODE,
  ITALIAN_GAME_LESSON_EPISODE,
  RUY_LOPEZ_LESSON_EPISODE,
  SICILIAN_NAJDORF_LESSON_EPISODE,
  FRENCH_WINAWER_LESSON_EPISODE,
  QGD_ORTHODOX_LESSON_EPISODE,
  CARO_KANN_CLASSICAL_LESSON_EPISODE,
  KINGS_INDIAN_CLASSICAL_LESSON_EPISODE,
  NIMZO_INDIAN_CLASSICAL_LESSON_EPISODE,
  CATALAN_OPEN_LESSON_EPISODE,
  ENGLISH_SYMMETRICAL_LESSON_EPISODE,
  SCOTCH_GAME_LESSON_EPISODE,
  VIENNA_GAMBIT_LESSON_EPISODE,
  KINGS_GAMBIT_ACCEPTED_LESSON_EPISODE,
  LONDON_SYSTEM_LESSON_EPISODE,
];

/** Default episode id when no `?episode=` is specified. */
export const DEFAULT_EPISODE_ID: string | undefined = CHESS_EPISODES[0]?.id;

/** Default episode id used by export scripts when no `--episode=` flag is passed. */
export const DEFAULT_EXPORT_EPISODE_ID: string | undefined = CHESS_EPISODES[0]?.id;

/** Look up an episode by id. */
export function getEpisode(id: string): Episode | undefined {
  return CHESS_EPISODES.find((episode) => episode.id === id);
}

/** All episodes that originated from the named source kind. */
export function listEpisodesBySource(source: EpisodeSource): Episode[] {
  return CHESS_EPISODES.filter((episode) => episode.source === source);
}

/** All episodes on a given content track. */
export function listEpisodesByTrack(track: Episode['track']): Episode[] {
  return CHESS_EPISODES.filter((episode) => episode.track === track);
}
