const express = require('express');
const router = express.Router();
const Survey = require('../models/Survey');
const Location = require('../models/Location');
const { authMiddleware } = require('../middleware/auth');
const { generateSTIFormula } = require('../utils/regression');

/**
 * POST /api/survey
 * Submit a survey response for a location+timeslot.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      locationId, timeSlot,
      lighting, crowdDensity, publicTransport, incidentFrequency, overallRating,
    } = req.body;

    if (!locationId || !timeSlot) {
      return res.status(400).json({ success: false, error: 'locationId and timeSlot are required' });
    }
    if (!['morning', 'afternoon', 'evening', 'night'].includes(timeSlot)) {
      return res.status(400).json({ success: false, error: 'Invalid timeSlot' });
    }

    const fields = { lighting, crowdDensity, publicTransport, incidentFrequency, overallRating };
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null || isNaN(v) || v < 0 || v > 10) {
        return res.status(400).json({ success: false, error: `${k} must be 0–10` });
      }
    }

    const location = await Location.findById(locationId);
    if (!location) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    const survey = new Survey({
      locationId,
      userToken: req.userToken,
      timeSlot,
      lighting: parseInt(lighting),
      crowdDensity: parseInt(crowdDensity),
      publicTransport: parseInt(publicTransport),
      incidentFrequency: parseInt(incidentFrequency),
      overallRating: parseInt(overallRating),
    });
    await survey.save();

    res.status(201).json({
      success: true,
      message: 'Survey submitted successfully',
      data: { surveyId: survey._id, locationName: location.name },
    });
  } catch (err) {
    console.error('POST /survey:', err);
    res.status(500).json({ success: false, error: 'Failed to submit survey' });
  }
});

/**
 * GET /api/survey/stats
 * Get survey submission count and per-field averages.
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await Survey.aggregate([
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgLighting: { $avg: '$lighting' },
          avgCrowd: { $avg: '$crowdDensity' },
          avgTransport: { $avg: '$publicTransport' },
          avgIncident: { $avg: '$incidentFrequency' },
          avgOverall: { $avg: '$overallRating' },
        },
      },
    ]);

    res.json({
      success: true,
      data: stats[0] || { count: 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch survey stats' });
  }
});

/**
 * GET /api/survey/weights
 * Run regression on collected survey data and return optimal weights + formula.
 */
router.get('/weights', async (req, res) => {
  try {
    const result = await generateSTIFormula();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('GET /survey/weights:', err);
    res.status(500).json({ success: false, error: 'Failed to compute weights' });
  }
});

module.exports = router;
