import openingsData from '../data/uho-openings.json';
import type { UHOOpening } from './types';

const openings: UHOOpening[] = openingsData as UHOOpening[];

export function getRandomOpening(excludeIds?: string[]): UHOOpening {
  const pool = excludeIds
    ? openings.filter(o => !excludeIds.includes(o.id))
    : openings;
  if (pool.length === 0) throw new Error('No openings available');
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getOpeningCount(): number {
  return openings.length;
}

export function getOpeningById(id: string): UHOOpening | undefined {
  return openings.find((opening) => opening.id === id);
}
