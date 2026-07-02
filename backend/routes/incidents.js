/**
 * Incident Routes
 * POST /api/incidents           — file a new incident report (with optional photo)
 * GET  /api/incidents           — list incidents (filterable, public)
 * GET  /api/incidents/:id       — incident detail
 * GET  /api/incidents/location/:locationId — incidents for a location
 * PATCH /api/incidents/:id       — admin: update report details/status
 * DELETE /api/incidents/:id      — admin: delete report
 * PUT  /api/incidents/:id/moderate — admin: verify / reject / escalate
 * POST /api/incidents/:id/police-ref — add police report reference
 */
const express  = require('express');
const router   = express.Router();
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const { authMiddleware, requireRole } = require('../middleware/auth');
const Incident = require('../models/Incident');
const Location = require('../models/Location');
const { broadcastZoneAlert } = require('../utils/pushService');
const { getIO } = require('../socket');

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
};
cloudinary.config(cloudinaryConfig);

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_URL ||
  (cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret)
);

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only JPG, PNG, and WebP incident photos are allowed.'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
});

const parseIncidentPhotos = upload.array('photos', 3);

function handlePhotoUpload(req, res, next) {
  parseIncidentPhotos(req, res, (err) => {
    if (!err) return next();

    let message = err.message || 'Invalid incident photo upload.';
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') message = 'Each incident photo must be 5MB or smaller.';
      else if (err.code === 'LIMIT_FILE_COUNT') message = 'You can upload up to 3 incident photos.';
    }

    return res.status(400).json({ success: false, error: message });
  });
}

function uploadPhotoToCloudinary(file) {
  if (!hasCloudinary) {
    const err = new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET before uploading incident photos.');
    err.status = 503;
    throw err;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'surakshamitra/incidents',
        resource_type: 'image',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          assetId: result.asset_id,
          mimeType: file.mimetype,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
        });
      }
    );

    stream.on('error', reject);
    stream.end(file.buffer);
  });
}

function cloudinaryUploadError(error) {
  const message = String(error?.message || '').trim();
  if (error?.http_code === 401 || /api key|signature|credentials|Invalid cloud_name/i.test(message)) {
    return 'Cloudinary upload failed: check Cloudinary credentials in Render.';
  }
  if (error?.http_code === 403) {
    return 'Cloudinary upload failed: this API key is not allowed to upload. Use a full-access Cloudinary API key or enable upload permission.';
  }
  if (message) return `Cloudinary upload failed: ${message}`;
  return 'Cloudinary upload failed.';
}

async function deleteCloudinaryPhotos(photos = []) {
  const publicIds = photos.map(photo => photo.publicId).filter(Boolean);
  if (!publicIds.length) return;
  await Promise.allSettled(publicIds.map(publicId => cloudinary.uploader.destroy(publicId, { resource_type: 'image' })));
}

// ── POST /api/incidents ───────────────────────────────────────────────
router.post('/', authMiddleware, handlePhotoUpload, async (req, res) => {
  let photos = [];
  try {
    const {
      locationId, type, severity, description,
      timeSlot, lat, lng, occurredAt,
    } = req.body;

    if (!locationId || !type || !severity || !description || !timeSlot) {
      return res.status(400).json({
        success: false,
        error: 'locationId, type, severity, description and timeSlot are required',
      });
    }

    const validTypes = ['harassment','stalking','theft','assault','unsafe_lighting',
                        'unsafe_crowd','infrastructure','suspicious_person','other'];
    if (!validTypes.includes(type))
      return res.status(400).json({ success: false, error: 'Invalid incident type' });

    const validSeverities = ['low','medium','high','critical'];
    if (!validSeverities.includes(severity))
      return res.status(400).json({ success: false, error: 'Invalid severity' });

    const location = await Location.findById(locationId);
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });

    photos = await Promise.all((req.files || []).map(uploadPhotoToCloudinary));

    // Build geo point: prefer user-provided coords, fall back to the location's own coords
    let geo;
    if (lat && lng) {
      geo = { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] };
    } else if (location.location && Array.isArray(location.location.coordinates)) {
      geo = { type: 'Point', coordinates: location.location.coordinates };
    }

    const incident = await Incident.create({
      locationId,
      userToken:   req.userToken,
      type,
      severity,
      description: description.slice(0, 1000),
      timeSlot,
      occurredAt:  occurredAt ? new Date(occurredAt) : new Date(),
      photos,
      geo,
    });

    // Run NLP on description (async, non-blocking)
    setImmediate(async () => {
      try {
        const { analyseComment } = require('../utils/nlpAnalyser');
        const analysis = await analyseComment(description, { locationName: location.name, timeSlot });
        if (analysis) {
          await Incident.findByIdAndUpdate(incident._id, {
            nlpTags:      analysis.tags || [],
            nlpSentiment: analysis.sentiment || 'negative',
          });
        }
      } catch (_) {}
    });

    // Broadcast zone alert for high/critical incidents
    if (['high', 'critical'].includes(severity)) {
      setImmediate(() => {
        try {
          const io = getIO();
          broadcastZoneAlert(io, {
            locationId:   location._id,
            locationName: location.name,
            area:         location.area,
            type,
            severity,
            timeSlot,
          });
          // Mark alert sent
          Incident.findByIdAndUpdate(incident._id, { alertSent: true }).catch(() => {});
        } catch (_) {}
      });
    }

    res.status(201).json({
      success: true,
      message: 'Incident report submitted. Thank you for keeping Bengaluru safer.',
      data: {
        incidentId: incident._id,
        type:       incident.type,
        severity:   incident.severity,
        photos:     photos.length,
      },
    });
  } catch (e) {
    if (photos.length) await deleteCloudinaryPhotos(photos);
    console.error('POST /incidents:', e);
    if (e?.http_code || /cloudinary/i.test(e?.message || '')) {
      return res.status(502).json({ success: false, error: cloudinaryUploadError(e) });
    }
    res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Failed to submit incident' });
  }
});

// ── GET /api/incidents ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, severity, status = 'visible', city = 'Bengaluru', limit = 50, page = 1 } = req.query;
    const query = {};
    if (type)     query.type     = type;
    if (severity) query.severity = severity;
    if (status === 'visible') query.status = { $in: ['pending', 'verified', 'escalated'] };
    else if (status !== 'all') query.status = status;

    const incidents = await Incident.find(query)
      .populate('locationId', 'name area city')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select('-userToken')
      .lean();

    // Filter by city via populated location
    const filtered = city !== 'all'
      ? incidents.filter(i => i.locationId?.city === city)
      : incidents;

    res.json({ success: true, data: filtered, count: filtered.length });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch incidents' });
  }
});

// ── PATCH /api/incidents/:id  (admin/moderator) ─────────────────────
router.patch('/:id', authMiddleware, requireRole('moderator', 'admin'), async (req, res) => {
  try {
    const allowed = ['type', 'severity', 'description', 'timeSlot', 'status', 'moderatorNote'];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (update.type && !['harassment','stalking','theft','assault','unsafe_lighting','unsafe_crowd','infrastructure','suspicious_person','other'].includes(update.type)) {
      return res.status(400).json({ success: false, error: 'Invalid incident type' });
    }
    if (update.severity && !['low','medium','high','critical'].includes(update.severity)) {
      return res.status(400).json({ success: false, error: 'Invalid severity' });
    }
    if (update.timeSlot && !['morning','afternoon','evening','night'].includes(update.timeSlot)) {
      return res.status(400).json({ success: false, error: 'Invalid timeSlot' });
    }
    if (update.status && !['pending','verified','rejected','escalated'].includes(update.status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    if (update.description) update.description = String(update.description).slice(0, 1000);
    if (update.status && update.status !== 'pending') {
      update.verifiedBy = req.userId;
      update.verifiedAt = new Date();
    }

    const incident = await Incident.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('locationId', 'name area city');
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: incident });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to update incident' });
  }
});

// ── DELETE /api/incidents/:id  (admin/moderator) ────────────────────
router.delete('/:id', authMiddleware, requireRole('moderator', 'admin'), async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });

    await deleteCloudinaryPhotos(incident.photos);

    await incident.deleteOne();
    res.json({ success: true, message: 'Incident deleted' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to delete incident' });
  }
});

// ── GET /api/incidents/location/:locationId ───────────────────────────
router.get('/location/:locationId', async (req, res) => {
  try {
    const { status, limit = 20 } = req.query;
    const query = { locationId: req.params.locationId };
    if (status) query.status = status;
    else        query.status = { $in: ['verified', 'pending'] }; // show both by default

    const incidents = await Incident.find(query)
      .sort({ occurredAt: -1 })
      .limit(parseInt(limit))
      .select('-userToken')
      .lean();

    const byType = incidents.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {});

    res.json({ success: true, data: incidents, summary: { total: incidents.length, byType } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch incidents' });
  }
});

// ── GET /api/incidents/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('locationId', 'name area type location')
      .select('-userToken')
      .lean();
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: incident });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch incident' });
  }
});

// ── PUT /api/incidents/:id/moderate  (admin/moderator) ───────────────
router.put('/:id/moderate', authMiddleware, requireRole('moderator', 'admin'), async (req, res) => {
  try {
    const { status, moderatorNote } = req.body;
    const validStatuses = ['verified','rejected','escalated'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, error: 'Invalid status' });

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        status,
        moderatorNote: moderatorNote || null,
        verifiedBy:    req.userId,
        verifiedAt:    new Date(),
      },
      { new: true }
    );
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: incident });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to moderate incident' });
  }
});

// ── POST /api/incidents/:id/police-ref ───────────────────────────────
router.post('/:id/police-ref', authMiddleware, async (req, res) => {
  try {
    const { refNumber, station, filedAt } = req.body;
    if (!refNumber) return res.status(400).json({ success: false, error: 'refNumber required' });

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        'policeReportRef.refNumber': refNumber,
        'policeReportRef.station':   station || null,
        'policeReportRef.filedAt':   filedAt ? new Date(filedAt) : new Date(),
      },
      { new: true }
    );
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: incident, message: 'Police report reference saved' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to save police ref' });
  }
});

module.exports = router;
