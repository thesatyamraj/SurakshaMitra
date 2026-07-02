/**
 * Incident — standalone structured report.
 * Separate from Rating.comment / NLP — this is an intentional,
 * detailed report with photo evidence and optional police linkage.
 */
const mongoose = require('mongoose');

const IncidentSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true,
  },
  userToken:  { type: String, required: true, index: true }, // anonymous or hashed userId

  // ── What happened ──────────────────────────────────────────────────
  type: {
    type: String,
    required: true,
    enum: [
      'harassment',       // verbal / physical / eve-teasing
      'stalking',         // being followed
      'theft',            // bag-snatching, pickpocketing
      'assault',          // physical attack
      'unsafe_lighting',  // broken / absent streetlights
      'unsafe_crowd',     // mob, drunk crowd, riot
      'infrastructure',   // broken footpath, no CCTV, dark underpass
      'suspicious_person',
      'other',
    ],
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
  },
  description: { type: String, required: true, maxlength: 1000 },
  timeSlot: {
    type: String,
    enum: ['morning','afternoon','evening','night'],
    required: true,
  },
  occurredAt: { type: Date, default: Date.now }, // when it happened

  // ── Evidence ───────────────────────────────────────────────────────
  photos: [{
    url:        { type: String },        // Cloudinary secure URL
    publicId:   { type: String },        // Cloudinary public_id, used for deletion
    assetId:    { type: String },
    mimeType:   { type: String },
    format:     { type: String },
    bytes:      { type: Number },
    width:      { type: Number },
    height:     { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  }],

  // ── Police report linkage ──────────────────────────────────────────
  policeReportRef: {
    refNumber: { type: String, default: null },    // FIR / NCR number
    station:   { type: String, default: null },    // police station name
    filedAt:   { type: Date,   default: null },
    verified:  { type: Boolean, default: false },  // admin-verified
  },

  // ── Geolocation (precise point if user shared it) ──────────────────
  geo: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined },  // [lng, lat]
  },

  // ── Moderation ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'escalated'],
    default: 'pending',
    index: true,
  },
  moderatorNote: { type: String, default: null },
  verifiedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt:    { type: Date, default: null },

  // NLP analysis (auto-populated from description)
  nlpTags: [String],
  nlpSentiment: { type: String, enum: ['positive','neutral','negative', null], default: null },

  // Whether this incident triggered a push/zone alert
  alertSent: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

IncidentSchema.index({ locationId: 1, status: 1 });
IncidentSchema.index({ geo: '2dsphere' });
IncidentSchema.index({ type: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model('Incident', IncidentSchema);
