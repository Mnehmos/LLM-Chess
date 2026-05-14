import type { Episode, EpisodeSource } from './types';

/**
 * All registered Chess Episodes in display order.
 *
 * Adding an episode: build its directory under `src/episodes/<id>/` and
 * append the exported `*_EPISODE` constant here. PR 1 ships the substrate
 * with an empty list; the first historic episode (Opera Game) lands in
 * PR 2.
 */
export const CHESS_EPISODES: Episode[] = [];

/** Default episode id when no `?episode=` is specified. Empty until PR 2. */
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
