/**
 * Emergency SOS + live tracking (PRD §6-B). KEEP from SurakshaMitra, hardened:
 *  - SOS PIN bcrypt-compared (never plaintext)
 *  - per-SOS socket room sos:<token> instead of io.emit
 *  - response returns before slow email/SMS side-effects (fire-and-forget)
 */
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const SOSEvent = require('../models/SOSEvent');
const User     = require('../models/User');
const Notification = require('../models/Notification');
const { authMiddleware, requireAuth } = require('../middleware/auth');
const { findNearbyVolunteers, nearestSafeZone } = require('../utils/geoService');
const { sendSOSAlertEmail } = require('../utils/emailService');
const { sendSOSSMS } = require('../utils/smsService');
const { getIO } = require('../socket');

function io() { try { return getIO(); } catch { return null; } }

// POST /api/sos/trigger
router.post('/trigger', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null)
      return res.status(400).json({ success: false, error: 'Location coordinates required.' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const existing = await SOSEvent.findOne({ triggeredBy: req.userId, isActive: true });
    if (existing)
      return res.status(400).json({ success: false, error: 'Active SOS already exists.', sosId: existing._id, shareToken: existing.shareToken });

    const shareToken = uuidv4();
    const coords = [Number(longitude), Number(latitude)];
    const sos = await SOSEvent.create({
      triggeredBy: user._id,
      locationAtTrigger: { type: 'Point', coordinates: coords },
      locationHistory: [{ coordinates: coords, timestamp: new Date() }],
      shareToken,
      notifiedContacts: user.emergencyContacts.map(c => c.email).filter(Boolean),
    });

    // Respond to victim IMMEDIATELY (speed beats completeness)
    res.status(201).json({ success: true, sosId: sos._id, shareToken });

    // ── Everything below is fire-and-forget ──
    setImmediate(async () => {
      const _io = io();
      if (_io) {
        _io.to('admin_room').emit('admin:new_sos', { sosId: sos._id, userName: user.name, location: { lat: latitude, lng: longitude }, triggeredAt: sos.createdAt });
        _io.to(`sos:${shareToken}`).emit('sos:triggered', { sosId: sos._id, shareToken, userName: user.name, location: { lat: latitude, lng: longitude } });
      }
      const volunteers = await findNearbyVolunteers(coords[0], coords[1], 5, user._id);
      if (volunteers.length) {
        sos.notifiedVolunteers = volunteers.map(v => v._id);
        await sos.save();
        volunteers.forEach(v => {
          _io?.to(`user:${v._id}`).emit('volunteer:sos_alert', { sosId: sos._id, shareToken, userName: user.name, distance: v.distance });
          Notification.create({ userId: v._id, type: 'zone_alert', title: '🚨 Nearby SOS', body: `${user.name} needs help ${v.distance}km away.`, url: `/track/${shareToken}` }).catch(()=>{});
        });
      }
      const emails = user.emergencyContacts.map(c => c.email).filter(Boolean);
      if (emails.length) {
        sendSOSAlertEmail(emails, { name: user.name, phone: user.phone }, coords, shareToken)
          .then(result => {
            if (!result?.ok && !result?.stub) console.warn('SOS email delivery failed:', result);
          })
          .catch(console.error);
      }
      const phones = user.emergencyContacts.map(c => c.phone).filter(Boolean);
      if (phones.length) sendSOSSMS(phones, user.name, latitude, longitude, shareToken).catch(console.error);
    });
  } catch (err) {
    console.error('SOS trigger error:', err);
    res.status(500).json({ success: false, error: 'Failed to trigger SOS.' });
  }
});

// POST /api/sos/test-email — send a test alert to saved emergency contacts
router.post('/test-email', authMiddleware, requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const emails = user.emergencyContacts.map(c => c.email).filter(Boolean);
    if (!emails.length) {
      return res.status(400).json({ success: false, error: 'Add at least one emergency contact email first.' });
    }

    const result = await sendSOSAlertEmail(
      emails,
      { name: `${user.name} (test)`, phone: user.phone },
      [77.5946, 12.9716],
      'test-email'
    );

    if (!result?.ok && !result?.stub) {
      return res.status(502).json({ success: false, error: result.error || 'Email provider rejected the message.', provider: result.provider });
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('SOS test email error:', err);
    res.status(500).json({ success: false, error: 'Failed to send test email.' });
  }
});

// PATCH /api/sos/:id/location — append live point + broadcast
router.patch('/:id/location', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const sos = await SOSEvent.findOne({ _id: req.params.id, triggeredBy: req.userId, isActive: true });
    if (!sos) return res.status(404).json({ success: false, error: 'Active SOS not found.' });
    const coords = [Number(longitude), Number(latitude)];
    sos.locationHistory.push({ coordinates: coords, timestamp: new Date() });
    await sos.save();
    io()?.to(`sos:${sos.shareToken}`).emit('sos:location_broadcast', { shareToken: sos.shareToken, location: { lat: latitude, lng: longitude }, timestamp: new Date() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to update location.' }); }
});

// PATCH /api/sos/:id/cancel — PIN-checked (bcrypt)
router.patch('/:id/cancel', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    const sos = await SOSEvent.findOne({ _id: req.params.id, triggeredBy: req.userId });
    if (!sos) return res.status(404).json({ success: false, error: 'SOS not found.' });
    if (!sos.isActive) return res.status(400).json({ success: false, error: 'SOS already cancelled.' });

    const user = await User.findById(req.userId).select('+sosPIN');
    if (!(await user.compareSOSPIN(pin)))
      return res.status(403).json({ success: false, error: 'Incorrect PIN.' });

    sos.isActive = false; sos.cancelledAt = new Date();
    await sos.save();
    io()?.to(`sos:${sos.shareToken}`).emit('sos:cancelled', { shareToken: sos.shareToken, cancelledAt: sos.cancelledAt });
    res.json({ success: true, message: 'SOS cancelled.' });
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to cancel SOS.' }); }
});

// GET /api/sos/active
router.get('/active', authMiddleware, requireAuth, async (req, res) => {
  const sos = await SOSEvent.findOne({ triggeredBy: req.userId, isActive: true });
  res.json({ success: true, sos });
});

// GET /api/sos/track/:token — PUBLIC, name + location + trail only (no contacts/email)
router.get('/track/:token', async (req, res) => {
  try {
    const sos = await SOSEvent.findOne({ shareToken: req.params.token }).populate('triggeredBy', 'name');
    if (!sos) return res.status(404).json({ success: false, error: 'Tracking link not found.' });
    const last = sos.locationHistory[sos.locationHistory.length - 1];
    res.json({ success: true, sos: {
      userName: sos.triggeredBy?.name || 'Someone',
      isActive: sos.isActive,
      current: last ? { lat: last.coordinates[1], lng: last.coordinates[0] } : null,
      trail: sos.locationHistory.map(p => ({ lat: p.coordinates[1], lng: p.coordinates[0], t: p.timestamp })),
      triggeredAt: sos.createdAt, cancelledAt: sos.cancelledAt,
    }});
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to load tracking.' }); }
});

// GET /api/sos/nearest-police?lat=&lng=
router.get('/nearest-police', async (req, res) => {
  const { lat, lng } = req.query;
  const zone = await nearestSafeZone(Number(lng), Number(lat), 'police');
  res.json({ success: true, zone });
});

module.exports = router;
