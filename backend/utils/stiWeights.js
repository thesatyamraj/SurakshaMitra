/**
 * Dynamic STI Weights Manager
 * Fetches regression-derived weights from survey data and caches them.
 * Falls back to hardcoded defaults if insufficient survey data.
 */

const { computeOptimalWeights } = require('./regression');

// Default hardcoded weights (used before enough survey data)
const DEFAULT_WEIGHTS = {
  lighting: 0.30,
  crowd:    0.30,
  police:   0.20,
  incident: 0.20,
};

let cachedWeights = null;
let lastFetch = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-derive every 6 hours

/**
 * Get current STI weights (regression-derived or defaults).
 */
async function getWeights() {
  const now = Date.now();
  if (cachedWeights && (now - lastFetch) < CACHE_TTL_MS) {
    return cachedWeights;
  }
  try {
    const result = await computeOptimalWeights();
    if (!result.fallback && result.r2 !== null && result.r2 >= 0.3) {
      // Only use regression weights if R² ≥ 0.3 (decent fit)
      cachedWeights = {
        lighting: result.weights.lighting,
        crowd:    result.weights.crowd,
        police:   result.weights.transport, // survey: publicTransport ≈ police infra
        incident: result.weights.incident,
        _source:  'regression',
        _r2:      result.r2,
        _n:       result.sampleSize,
      };
    } else {
      cachedWeights = { ...DEFAULT_WEIGHTS, _source: 'default', _r2: result.r2, _n: result.sampleSize };
    }
    lastFetch = now;
  } catch (e) {
    console.warn('Weight derivation failed, using defaults:', e.message);
    cachedWeights = { ...DEFAULT_WEIGHTS, _source: 'default' };
  }
  return cachedWeights;
}

/** Force-invalidate the cache (call after new survey data comes in). */
function invalidateWeightCache() {
  cachedWeights = null;
  lastFetch = 0;
}

/** Compute STI from factors using live weights. */
async function computeWeightedSTI({ lighting, crowdBehavior, policeVisibility, incidentWeight }) {
  const w = await getWeights();
  const sti = w.lighting  * lighting
            + w.crowd     * crowdBehavior
            + w.police    * policeVisibility
            + w.incident  * (10 - incidentWeight);
  return Math.round(sti * 10) / 10;
}

module.exports = { getWeights, invalidateWeightCache, computeWeightedSTI, DEFAULT_WEIGHTS };
