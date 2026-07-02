/**
 * Admin & Moderator Routes
 * Protected by requireRole middleware.
 * Handles: location approval, flagged-rater management, STI override, stats.
 */
const express = require('express');
const router  = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const Location   = require('../models/Location');
const Rating     = require('../models/Rating');
const UserTrust  = require('../models/UserTrust');
const User       = require('../models/User');
const STIHistory = require('../models/STIHistory');

// All admin routes require auth + moderator/admin role
router.use(authMiddleware);
router.use(requireRole('moderator', 'admin'));

// ── Dashboard stats ──────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalLocations, pendingLocations, totalRatings, flaggedUsers, totalUsers] = await Promise.all([
      Location.countDocuments(),
      Location.countDocuments({ isVerified: false }),
      Rating.countDocuments(),
      UserTrust.countDocuments({ isFlagged: true }),
      User.countDocuments(),
    ]);

    const recentRatings = await Rating.find()
      .populate('locationId', 'name area')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('locationId timeSlot rawSTI nlpAnalysis.severity createdAt')
      .lean();

    const incidentBreakdown = await Rating.aggregate([
      { $match: { 'nlpAnalysis.incidentType': { $ne: null } } },
      { $group: { _id: '$nlpAnalysis.incidentType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    res.json({
      success: true,
      data: {
        totalLocations, pendingLocations, totalRatings, flaggedUsers, totalUsers,
        recentRatings,
        incidentBreakdown,
      }
    });
  } catch (e) {
    console.error('Admin stats error:', e);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// ── Location approval queue ──────────────────────────────────────────
router.get('/locations/pending', async (req, res) => {
  try {
    const locations = await Location.find({ isVerified: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: locations });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch pending locations' });
  }
});

router.put('/locations/:id/approve', async (req, res) => {
  try {
    const loc = await Location.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    );
    if (!loc) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, data: loc, message: 'Location approved' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to approve location' });
  }
});

router.delete('/locations/:id', requireRole('admin'), async (req, res) => {
  try {
    await Location.findByIdAndDelete(req.params.id);
    await Rating.deleteMany({ locationId: req.params.id });
    res.json({ success: true, message: 'Location deleted' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete location' });
  }
});

// ── Flagged raters ───────────────────────────────────────────────────
router.get('/users/flagged', async (req, res) => {
  try {
    const flagged = await UserTrust.find({ isFlagged: true })
      .sort({ flaggedRatings: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: flagged });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch flagged users' });
  }
});

router.put('/users/:tokenHash/unflag', requireRole('admin'), async (req, res) => {
  try {
    const trust = await UserTrust.findOneAndUpdate(
      { tokenHash: req.params.tokenHash },
      { isFlagged: false, flagReason: null, trs: 0.5, flaggedRatings: 0 },
      { new: true }
    );
    if (!trust) return res.status(404).json({ success: false, error: 'User trust record not found' });
    res.json({ success: true, data: trust });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to unflag user' });
  }
});

router.put('/users/:tokenHash/block', requireRole('admin'), async (req, res) => {
  try {
    const trust = await UserTrust.findOneAndUpdate(
      { tokenHash: req.params.tokenHash },
      { isFlagged: true, flagReason: req.body.reason || 'Manually blocked by admin', trs: 0.1 },
      { new: true }
    );
    // Mark all their ratings as excluded
    await Rating.updateMany({ userToken: req.params.tokenHash }, { isIncluded: false });
    res.json({ success: true, data: trust });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to block user' });
  }
});

// ── Ratings with incidents (NLP flagged) ────────────────────────────
router.get('/ratings/incidents', async (req, res) => {
  try {
    const { severity, type } = req.query;
    const query = { 'nlpAnalysis.incidentType': { $ne: null } };
    if (severity) query['nlpAnalysis.severity'] = severity;
    if (type)     query['nlpAnalysis.incidentType'] = type;

    const ratings = await Rating.find(query)
      .populate('locationId', 'name area')
      .sort({ createdAt: -1 })
      .limit(100)
      .select('locationId timeSlot comment nlpAnalysis rawSTI createdAt')
      .lean();

    res.json({ success: true, data: ratings, count: ratings.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch incident ratings' });
  }
});

// ── STI manual override ──────────────────────────────────────────────
router.put('/locations/:id/sti-override', requireRole('admin'), async (req, res) => {
  try {
    const { timeSlot, sti, reason } = req.body;
    if (!timeSlot || sti === undefined)
      return res.status(400).json({ success: false, error: 'timeSlot and sti required' });

    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });

    const slotIdx = location.timeSlots.findIndex(s => s.slot === timeSlot);
    if (slotIdx === -1) return res.status(400).json({ success: false, error: 'Invalid timeSlot' });

    location.timeSlots[slotIdx].sti      = parseFloat(sti);
    location.timeSlots[slotIdx].category = sti >= 8 ? 'safe' : sti >= 5 ? 'moderate' : 'risky';
    location.recomputeOverall();
    await location.save();

    // Log override in history
    await STIHistory.create({
      locationId: location._id, timeSlot,
      sti: parseFloat(sti),
      category: location.timeSlots[slotIdx].category,
      ratingCount: location.timeSlots[slotIdx].ratingCount,
    });

    res.json({ success: true, data: location, message: `STI overridden to ${sti}` });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to override STI' });
  }
});

module.exports = router;
