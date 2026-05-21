import { OPERA_GAME_EPISODE } from './opera_game_morphy_1858';
import { ITALIAN_GAME_LESSON_EPISODE } from './italian_game_lesson';
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
