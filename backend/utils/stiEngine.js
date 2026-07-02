/**
 * STI Computation Engine v2.1
 * – Dynamic regression weights (stiWeights.js)
 * – Network availability as safety signal
 * – NLP sentiment feeds back into rawSTI weighting
 * – Fires push/socket alerts on STI drops via pushService
 */

const Rating    = require('../models/Rating');
const UserTrust = require('../models/UserTrust');
const Location  = require('../models/Location');
const { getWeights } = require('./stiWeights');

const MIN_VOTES_TO_PUBLISH = 3;

// NLP sentiment → small STI adjustment
// Many "negative" comments at a location are a genuine signal
const SENTIMENT_WEIGHT = { positive: +0.15, neutral: 0, negative: -0.20 };

async function computeSTI(locationId, timeSlot) {
  const ratings = await Rating.find({ locationId, timeSlot, isIncluded: true }).lean();

  if (ratings.length < MIN_VOTES_TO_PUBLISH) {
    return {
      sti: null, category: 'unrated',
      ratingCount: ratings.length,
      avgLighting: null, avgCrowd: null, avgPolice: null,
      avgIncident: null, avgNetwork: null,
      sentimentAdj: 0,
      needsMoreVotes: true,
    };
  }

  const tokenHashes = [...new Set(ratings.map(r => r.userToken))];
  const trustScores = await UserTrust.find({ tokenHash: { $in: tokenHashes } }).lean();
  const trsMap = Object.fromEntries(trustScores.map(t => [t.tokenHash, t.trs]));

  const w = await getWeights();

  let wSum = 0;
  let wLighting = 0, wCrowd = 0, wPolice = 0, wIncident = 0;
  let wNetwork = 0, networkCount = 0;
  let sentimentSum = 0, sentimentCount = 0;

  for (const r of ratings) {
    const trs = trsMap[r.userToken] ?? 0.5;
    wSum      += trs;
    wLighting += trs * r.lighting;
    wCrowd    += trs * r.crowdBehavior;
    wPolice   += trs * r.policeVisibility;
    wIncident += trs * r.incidentWeight;

    if (r.networkAvailability != null) {
      wNetwork += trs * r.networkAvailability;
      networkCount++;
    }

    // NLP sentiment feedback — only from ratings that have been analysed
    if (r.nlpAnalysis?.sentiment && r.nlpAnalysis?.processedAt) {
      const adj = SENTIMENT_WEIGHT[r.nlpAnalysis.sentiment] ?? 0;
      sentimentSum += adj;
      sentimentCount++;
    }
  }

  if (wSum === 0) wSum = 1;

  const avgL = wLighting / wSum;
  const avgC = wCrowd    / wSum;
  const avgP = wPolice   / wSum;
  const avgI = wIncident / wSum;
  const avgN = networkCount > 0 ? wNetwork / wSum : null;

  // Network adjustment: ±0.25
  const networkAdj = avgN !== null ? ((avgN - 5) / 10) * 0.5 : 0;

  // Sentiment adjustment: capped at ±0.3
  const sentimentAdj = sentimentCount > 0
    ? Math.max(-0.3, Math.min(0.3, sentimentSum / sentimentCount))
    : 0;

  const raw = w.lighting  * avgL
            + w.crowd     * avgC
            + w.police    * avgP
            + w.incident  * (10 - avgI)
            + networkAdj
            + sentimentAdj;

  const sti = Math.max(0, Math.min(10, Math.round(raw * 10) / 10));

  return {
    sti,
    category: categorize(sti),
    ratingCount: ratings.length,
    avgLighting: Math.round(avgL * 10) / 10,
    avgCrowd:    Math.round(avgC * 10) / 10,
    avgPolice:   Math.round(avgP * 10) / 10,
    avgIncident: Math.round(avgI * 10) / 10,
    avgNetwork:  avgN !== null ? Math.round(avgN * 10) / 10 : null,
    sentimentAdj: Math.round(sentimentAdj * 100) / 100,
    weightsUsed: { ...w },
    needsMoreVotes: false,
  };
}

function categorize(sti) {
  if (sti >= 8) return 'safe';
  if (sti >= 5) return 'moderate';
  return 'risky';
}

async function updateLocationSTI(locationId, timeSlot) {
  const result = await computeSTI(locationId, timeSlot);
  const location = await Location.findById(locationId);
  if (!location) return;

  const slotIdx = location.timeSlots.findIndex(s => s.slot === timeSlot);
  if (slotIdx === -1) return;

  const oldSTI = location.timeSlots[slotIdx].sti ?? null;

  if (!result.needsMoreVotes) {
    location.timeSlots[slotIdx].sti         = result.sti;
    location.timeSlots[slotIdx].category    = result.category;
    location.timeSlots[slotIdx].lastUpdated = new Date();
  }
  location.timeSlots[slotIdx].ratingCount  = result.ratingCount;
  location.timeSlots[slotIdx].avgLighting  = result.avgLighting;
  location.timeSlots[slotIdx].avgCrowd     = result.avgCrowd;
  location.timeSlots[slotIdx].avgPolice    = result.avgPolice;
  location.timeSlots[slotIdx].avgIncident  = result.avgIncident;

  location.totalRatings = location.timeSlots.reduce((s, sl) => s + (sl.ratingCount || 0), 0);
  location.recomputeOverall();
  await location.save();

  // Snapshot STI history
  try {
    const STIHistory = require('../models/STIHistory');
    await STIHistory.create({
      locationId,
      timeSlot,
      sti:         result.sti,
      category:    result.category,
      ratingCount: result.ratingCount,
    });
  } catch (_) {}

  // Fire alerts on STI drop (non-blocking)
  if (result.sti !== null && oldSTI !== null && result.sti < oldSTI) {
    setImmediate(async () => {
      try {
        const { alertSTIDrop } = require('./pushService');
        const { getIO } = require('../socket');
        let io; try { io = getIO(); } catch (_) {}
        await alertSTIDrop(locationId, timeSlot, result.sti, oldSTI, { io });
      } catch (e) {
        console.warn('Alert dispatch error:', e.message);
      }
    });
  }

  return result;
}

async function updateUserTRS(userToken, locationId, timeSlot, userRawSTI) {
  const location = await Location.findById(locationId).lean();
  if (!location) return;

  const slot = location.timeSlots?.find(s => s.slot === timeSlot);
  const consensusSTI = slot?.sti ?? null;

  let userTrust = await UserTrust.findOne({ tokenHash: userToken });
  if (!userTrust) userTrust = new UserTrust({ tokenHash: userToken });

  userTrust.totalRatings += 1;
  userTrust.lastActivity = new Date();

  if (consensusSTI !== null) {
    const deviation = Math.abs(userRawSTI - consensusSTI);
    if (deviation <= 2)     userTrust.consensusMatches += 1;
    else if (deviation > 4) userTrust.flaggedRatings   += 1;
  } else {
    userTrust.consensusMatches += 1;
  }

  userTrust.recomputeTRS();
  await userTrust.save();
  return userTrust.trs;
}

module.exports = { computeSTI, updateLocationSTI, updateUserTRS, categorize };
