const express = require('express');
const router  = express.Router();
const SafeZone = require('../models/SafeZone');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/safezones — public list (map pins)
router.get('/', async (req, res) => {
  const zones = await SafeZone.find().lean();
  res.json({ success: true, zones });
});

// POST /api/safezones — admin add
router.post('/', authMiddleware, requireRole('admin','moderator'), async (req, res) => {
  try {
    const { name, type, lat, lng, phone } = req.body;
    const zone = await SafeZone.create({ name, type, phone, location: { type: 'Point', coordinates: [Number(lng), Number(lat)] }, addedBy: req.userId });
    res.status(201).json({ success: true, zone });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/safezones/:id — admin
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await SafeZone.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
