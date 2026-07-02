const express  = require('express');
const router   = express.Router();
const Rating   = require('../models/Rating');
const Location = require('../models/Location');
const STIHistory = require('../models/STIHistory');
const { authMiddleware } = require('../middleware/auth');
const { updateLocationSTI, updateUserTRS } = require('../utils/stiEngine');
const { processRatingComment } = require('../utils/nlpAnalyser');
const { getIO } = require('../socket');

router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      locationId, timeSlot,
      lighting, crowdBehavior, policeVisibility, incidentWeight,
      networkAvailability, comment, tags,
    } = req.body;

    if (!locationId || !timeSlot)
      return res.status(400).json({ success: false, error: 'locationId and timeSlot are required' });
    if (!['morning','afternoon','evening','night'].includes(timeSlot))
      return res.status(400).json({ success: false, error: 'Invalid timeSlot' });

    const factors = { lighting, crowdBehavior, policeVisibility, incidentWeight };
    for (const [k, v] of Object.entries(factors)) {
      if (v === undefined || v === null || isNaN(v) || v < 0 || v > 10)
        return res.status(400).json({ success: false, error: `${k} must be 0–10` });
    }

    let netVal = null;
    if (networkAvailability != null) {
      netVal = parseFloat(networkAvailability);
      if (isNaN(netVal) || netVal < 0 || netVal > 10)
        return res.status(400).json({ success: false, error: 'networkAvailability must be 0–10' });
    }

    const location = await Location.findById(locationId);
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const recent = await Rating.findOne({
      locationId, userToken: req.userToken, timeSlot,
      createdAt: { $gte: sixHoursAgo },
    });
    if (recent) return res.status(429).json({
      success: false,
      error: 'You already rated this location recently. Try again in 6 hours.',
    });

    const rating = new Rating({
      locationId, userToken: req.userToken, timeSlot,
      lighting:         parseInt(lighting),
      crowdBehavior:    parseInt(crowdBehavior),
      policeVisibility: parseInt(policeVisibility),
      incidentWeight:   parseInt(incidentWeight),
      networkAvailability: netVal,
      comment: comment?.slice(0, 500) || '',
      tags: Array.isArray(tags) ? tags.slice(0, 7) : [],
      trsAtSubmission: 0.5,
    });
    await rating.save();

    // Track location for personalised alerts (registered users only)
    if (req.userId) {
      try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.userId, {
          $addToSet: { ratedLocationIds: locationId },
        });
      } catch (_) {}
    }

    setImmediate(async () => {
      try {
        const stiResult = await updateLocationSTI(locationId, timeSlot);
        if (stiResult) {
          await updateUserTRS(req.userToken, locationId, timeSlot, rating.rawSTI);
          try {
            const io = getIO();
            const updatedLocation = await Location.findById(locationId).lean();
            io.emit('heatmap-update', {
              locationId, timeSlot,
              sti:         stiResult.sti,
              category:    stiResult.category,
              ratingCount: stiResult.ratingCount,
              location:    updatedLocation,
            });
          } catch (_) {}
        }
      } catch (e) { console.error('Async STI/TRS update error:', e); }

      if (rating.comment?.trim().length >= 10) {
        processRatingComment(rating._id, rating.comment, {
          locationName: location.name, timeSlot,
        });
      }
    });

    res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        ratingId:    rating._id,
        rawSTI:      rating.rawSTI,
        locationName: location.name,
        timeSlot,
        isNewToken:  req.isNewToken || false,
      },
    });
  } catch (err) {
    console.error('POST /ratings:', err);
    res.status(500).json({ success: false, error: 'Failed to submit rating' });
  }
});

router.get('/location/:locationId', async (req, res) => {
  try {
    const { slot } = req.query;
    const query = { locationId: req.params.locationId, isIncluded: true };
    if (slot) query.timeSlot = slot;

    const ratings = await Rating.find(query)
      .select('timeSlot lighting crowdBehavior policeVisibility incidentWeight networkAvailability rawSTI tags nlpAnalysis createdAt')
      .sort({ createdAt: -1 }).limit(100).lean();

    const bySlot = {};
    for (const r of ratings) {
      if (!bySlot[r.timeSlot]) bySlot[r.timeSlot] = [];
      bySlot[r.timeSlot].push(r);
    }

    const summary = Object.entries(bySlot).map(([s, rs]) => {
      const netRatings = rs.filter(r => r.networkAvailability != null);
      const sentiments = rs.filter(r => r.nlpAnalysis?.sentiment).reduce((a, r) => {
        a[r.nlpAnalysis.sentiment] = (a[r.nlpAnalysis.sentiment] || 0) + 1;
        return a;
      }, {});
      return {
        slot: s,
        count: rs.length,
        avgSTI:     Math.round((rs.reduce((a, r) => a + r.rawSTI, 0) / rs.length) * 10) / 10,
        avgLighting: Math.round((rs.reduce((a, r) => a + r.lighting, 0) / rs.length) * 10) / 10,
        avgCrowd:    Math.round((rs.reduce((a, r) => a + r.crowdBehavior, 0) / rs.length) * 10) / 10,
        avgNetwork:  netRatings.length > 0
          ? Math.round((netRatings.reduce((a, r) => a + r.networkAvailability, 0) / netRatings.length) * 10) / 10
          : null,
        sentiments,
        incidentTypes: rs.flatMap(r => r.nlpAnalysis?.incidentType ? [r.nlpAnalysis.incidentType] : []).slice(0, 5),
        recentTags:    rs.flatMap(r => r.tags).slice(0, 10),
      };
    });

    res.json({ success: true, data: { summary, recentCount: ratings.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch ratings' });
  }
});

router.get('/location/:locationId/trend', async (req, res) => {
  try {
    const { slot } = req.query;
    const query = { locationId: req.params.locationId };
    if (slot) query.timeSlot = slot;
    const snapshots = await STIHistory.find(query)
      .sort({ recordedAt: -1 }).limit(120).lean();
    res.json({ success: true, data: snapshots.reverse() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch trend data' });
  }
});

router.get('/my', authMiddleware, async (req, res) => {
  try {
    const ratings = await Rating.find({ userToken: req.userToken })
      .populate('locationId', 'name area')
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: ratings, count: ratings.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch your ratings' });
  }
});

module.exports = router;
