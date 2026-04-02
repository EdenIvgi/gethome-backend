import { config } from '../config.js';

/**
 * Map a neighborhood name to a Tel Aviv area using config.telAvivAreas.
 */
export function resolveArea(neighborhood) {
  if (!neighborhood) return null;
  for (const [area, neighborhoods] of Object.entries(config.telAvivAreas)) {
    if (neighborhoods.some((n) => neighborhood.includes(n) || n.includes(neighborhood))) {
      return area;
    }
  }
  return null;
}
