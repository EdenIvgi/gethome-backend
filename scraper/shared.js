import { config } from '../config.js';

const HEB_LATIN_NUM = '\\u0590-\\u05EAa-zA-Z0-9';

/**
 * Normalize a place string: trim, collapse whitespace, strip Hebrew gershayim
 * / quotes / commas / dots that vary between sources.
 */
function normalize(s) {
  return String(s)
    .replace(/["'`׳״]/g, '')
    .replace(/[,.\-־–—•·|/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// City names that sometimes land in the neighborhood field — they carry no
// area information and must NOT match (e.g. "תל אביב-יפו" must not hit "יפו").
const CITY_NAMES = new Set(['תל אביב', 'תל אביב יפו', 'תל אביב יפו ']);

// Pre-normalized known-name lists so config entries with gershayim/apostrophes
// (e.g. "ז׳בוטינסקי") match input that normalize() has stripped.
const AREAS_NORM = Object.fromEntries(
  Object.entries(config.telAvivAreas).map(([a, ns]) => [a, ns.map(normalize)])
);
const STREETS_NORM = Object.fromEntries(
  Object.entries(config.telAvivStreets || {}).map(([a, ss]) => [a, ss.map(normalize)])
);

/**
 * True if `needle` appears inside `haystack` as a standalone phrase (bounded
 * by string edges or non-letter/digit chars). Deliberately ONE-directional —
 * we never test whether the known name contains the input, the old bug that
 * let a fragment like "לב" match "לב העיר".
 */
function containsPhrase(haystack, needle) {
  if (!needle || needle.length < 2) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^${HEB_LATIN_NUM}])${esc}($|[^${HEB_LATIN_NUM}])`);
  return re.test(haystack);
}

// Alias-augmented, city-stripped normalized form of a single place string.
function prep(raw) {
  if (!raw) return null;
  let norm = normalize(raw);
  if (!norm || CITY_NAMES.has(norm)) return null;
  const lower = norm.toLowerCase();
  for (const [alias, canonical] of Object.entries(config.neighborhoodAliases || {})) {
    if (lower === alias || containsPhrase(lower, alias)) {
      norm = `${norm} ${canonical}`;
      break;
    }
  }
  return norm;
}

function matchArea(text, MAP) {
  if (!text) return null;
  for (const [area, names] of Object.entries(MAP)) {
    if (names.some((n) => containsPhrase(text, n))) return area;
  }
  return null;
}

/**
 * Resolve a Tel Aviv area from a neighborhood (preferred) and, failing that,
 * a street name. A KNOWN street is factual ground truth and outranks the
 * neighborhood — on Facebook the neighborhood is often an LLM guess inferred
 * FROM the street and can be confidently wrong ("יסוד המעלה" → "רמת אביב").
 * Returns null when nothing is confidently recognized.
 */
export function resolveArea(neighborhood, street) {
  const nText = prep(neighborhood);
  const sText = prep(street);
  return (
    matchArea(nText, STREETS_NORM) || matchArea(sText, STREETS_NORM) ||
    matchArea(nText, AREAS_NORM) || matchArea(sText, AREAS_NORM) ||
    null
  );
}

/**
 * Return the neighborhood only if it doesn't contradict a known street's
 * area; otherwise null. Stops a hallucinated neighborhood from being stored
 * alongside a correct (street-derived) area.
 */
export function reconcileNeighborhood(neighborhood, street) {
  if (!neighborhood) return null;
  const streetArea = matchArea(prep(street), STREETS_NORM);
  if (!streetArea) return neighborhood; // no ground truth to contradict
  const nbhdArea = matchArea(prep(neighborhood), AREAS_NORM);
  if (nbhdArea && nbhdArea !== streetArea) return null; // untrusted guess
  return neighborhood;
}
