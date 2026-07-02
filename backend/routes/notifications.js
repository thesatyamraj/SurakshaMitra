/**
 * Notification Routes
 * GET  /api/notifications          — inbox for logged-in user
 * PUT  /api/notifications/:id/read — mark as read
 * PUT  /api/notifications/read-all — mark all read
 * POST /api/notifications/push-sub — save Web Push subscription
 * PUT  /api/notifications/prefs    — update notification preferences
 * GET  /api/notifications/vapid-key — return VAPID public key
 */
const express  = require('express');
const router   = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const Notification = require('../models/Notification');
const User         = require('../models/User');

// All routes require a logged-in (non-anon) user
function requireUser(req, res, next) {
  if (!req.userId) return res.status(401).json({ success: false, error: 'Login required.' });
  next();
}

// ── VAPID public key ──────────────────────────────────────────────────
router.get('/vapid-key', (req, res) => {
  res.json({ success: true, vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// ── Notification inbox ────────────────────────────────────────────────
router.get('/', authMiddleware, requireUser, async (req, res) => {
  try {
    const { page = 1, limit = 30, unreadOnly } = req.query;
    const query = { userId: req.userId };
    if (unreadOnly === 'true') query.read = false;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments({ userId: req.userId, read: false }),
    ]);

    res.json({ success: true, data: notifications, unreadCount, page: parseInt(page) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// ── Mark single read ──────────────────────────────────────────────────
router.put('/:id/read', authMiddleware, requireUser, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { read: true, readAt: new Date() },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, data: notif });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

// ── Mark all read ─────────────────────────────────────────────────────
router.put('/read-all', authMiddleware, requireUser, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.userId, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true, updated: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to mark all read' });
  }
});

// ── Save Web Push subscription ────────────────────────────────────────
router.post('/push-sub', authMiddleware, requireUser, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, error: 'Invalid push subscription' });
    }
    await User.findByIdAndUpdate(req.userId, {
      pushSubscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      'notifPrefs.pushEnabled': true,
    });
    res.json({ success: true, message: 'Push subscription saved' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to save push subscription' });
  }
});

// ── Remove push subscription ──────────────────────────────────────────
router.delete('/push-sub', authMiddleware, requireUser, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      pushSubscription: { endpoint: null, keys: { p256dh: null, auth: null } },
      'notifPrefs.pushEnabled': false,
    });
    res.json({ success: true, message: 'Push subscription removed' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to remove push subscription' });
  }
});

// ── Update notification preferences ──────────────────────────────────
router.put('/prefs', authMiddleware, requireUser, async (req, res) => {
  try {
    const allowed = ['pushEnabled','emailEnabled','stiDropAlerts','weeklyDigest','zoneAlerts','alertThreshold'];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[`notifPrefs.${key}`] = req.body[key];
      }
    }
    // Email: store address if provided
    if (req.body.email) {
      update.email = req.body.email.toLowerCase().trim();
      update['notifPrefs.emailEnabled'] = true;
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true });
    res.json({ success: true, data: user.toSafeObject() });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// ── Admin: trigger weekly digest for all eligible users ──────────────
router.post('/digest/trigger', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { sendWeeklyDigest } = require('../utils/pushService');
    const { getIO } = require('../socket');
    let io; try { io = getIO(); } catch (_) {}

    const users = await User.find({
      'notifPrefs.weeklyDigest': true,
      ratedLocationIds: { $exists: true, $not: { $size: 0 } },
    }).select('_id').lean();

    let sent = 0;
    for (const u of users) {
      await sendWeeklyDigest(u._id, { io });
      sent++;
    }
    res.json({ success: true, sent });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Digest trigger failed' });
  }
});

module.exports = router;
