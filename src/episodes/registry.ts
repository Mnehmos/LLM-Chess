import { OPERA_GAME_EPISODE } from './opera_game_morphy_1858';
import { ITALIAN_GAME_LESSON_EPISODE } from './italian_game_lesson';
import { RUY_LOPEZ_LESSON_EPISODE } from './ruy_lopez_lesson';
import { SICILIAN_NAJDORF_LESSON_EPISODE } from './sicilian_najdorf_lesson';
import { FRENCH_WINAWER_LESSON_EPISODE } from './french_winawer_lesson';
import { QGD_ORTHODOX_LESSON_EPISODE } from './qgd_orthodox_lesson';
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
