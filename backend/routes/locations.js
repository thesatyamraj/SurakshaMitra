const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/locations
 * Fetch all locations with optional filters.
 * Query params:
 *   - slot: morning|afternoon|evening|night
 *   - category: safe|moderate|risky
 *   - city: default Bengaluru
 *   - lat, lng, radius: geospatial (radius in meters, default 10km)
 *   - search: text search on name/area
 *   - limit, page
 */
router.get('/', async (req, res) => {
  try {
    const {
      slot, category, city = 'Bengaluru',
      lat, lng, radius = 10000,
      search, limit = 50, page = 1
    } = req.query;

    let query = { city };

    // Geospatial filter
    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius)
        }
      };
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by slot category
    if (slot && category) {
      query.timeSlots = {
        $elemMatch: { slot, category }
      };
    } else if (slot) {
      query['timeSlots.slot'] = slot;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const locations = await Location.find(query)
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ totalRatings: -1 })
      .lean();

    const total = await Location.countDocuments(query);

    res.json({
      success: true,
      data: locations,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('GET /locations:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch locations' });
  }
});

/**
 * GET /api/locations/heatmap
 * Returns lightweight GeoJSON FeatureCollection for heatmap rendering.
 * Each feature has STI per time slot.
 */
router.get('/heatmap', async (req, res) => {
  try {
    const { slot = 'evening', city = 'Bengaluru' } = req.query;

    const locations = await Location.find({ city }).lean();

    const features = locations.map(loc => {
      const slotData = loc.timeSlots?.find(s => s.slot === slot);
      return {
        type: 'Feature',
        geometry: loc.location,
        properties: {
          id: loc._id,
          name: loc.name,
          area: loc.area,
          type: loc.type,
          sti: slotData?.sti ?? null,
          category: slotData?.category ?? 'unrated',
          ratingCount: slotData?.ratingCount ?? 0,
          overallSTI: loc.overallSTI,
          slot
        }
      };
    });

    res.json({
      type: 'FeatureCollection',
      features,
      meta: { slot, city, count: features.length, generatedAt: new Date() }
    });
  } catch (err) {
    console.error('GET /locations/heatmap:', err);
    res.status(500).json({ success: false, error: 'Failed to generate heatmap data' });
  }
});

/**
 * GET /api/locations/search/:query
 * Autocomplete location search
 */
router.get('/search/:query', async (req, res) => {
  try {
    const q = String(req.params.query || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const locations = await Location.find({
      city: 'Bengaluru',
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { area: { $regex: escaped, $options: 'i' } }
      ]
    })
      .sort({ totalRatings: -1, name: 1 })
      .limit(10)
      .select('name area type location overallSTI timeSlots')
      .lean();

    res.json({ success: true, data: locations });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/locations/:id
 * Full location detail with all time-slot STI data
 */
router.get('/:id', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id).lean();
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, data: location });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch location' });
  }
});

/**
 * POST /api/locations
 * Create a new location (user-suggested)
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, area, type, coordinates } = req.body;
    if (!name || !coordinates || coordinates.length !== 2) {
      return res.status(400).json({ success: false, error: 'name and coordinates [lng,lat] required' });
    }

    const existing = await Location.findOne({
      'location.coordinates': { $near: { $geometry: { type: 'Point', coordinates }, $maxDistance: 50 } },
      name: { $regex: new RegExp(name, 'i') }
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Similar location already exists', data: existing });
    }

    const location = new Location({
      name, area, type: type || 'other',
      city: 'Bengaluru',
      location: { type: 'Point', coordinates }
    });
    await location.save();
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    console.error('POST /locations:', err);
    res.status(500).json({ success: false, error: 'Failed to create location' });
  }
});

module.exports = router;
