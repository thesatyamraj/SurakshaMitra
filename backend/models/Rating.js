const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true
  },
  userToken: { type: String, required: true, index: true },

  timeSlot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night'],
    required: true
  },

  // Core rating factors (1–10 scale)
  lighting:          { type: Number, required: true, min: 1, max: 10 },
  crowdBehavior:     { type: Number, required: true, min: 1, max: 10 },
  policeVisibility:  { type: Number, required: true, min: 1, max: 10 },
  incidentWeight:    { type: Number, required: true, min: 0, max: 10 },

  // ── NEW: Network availability (0 = no signal, 10 = excellent) ──────
  // Replaces crimeReportRef. Poor connectivity = higher danger (can't call for help).
  networkAvailability: {
    type: Number,
    min: 0,
    max: 10,
    default: null,   // null = user did not provide; not penalised
  },

  // Computed STI for this submission (before TRS weighting)
  rawSTI: { type: Number },

  // Free-text comment (analysed by Gemini NLP)
  comment: { type: String, maxlength: 500, default: '' },

  // NLP analysis result (populated async after submission)
  nlpAnalysis: {
    incidentType:  { type: String, default: null }, // e.g. 'harassment', 'theft', 'unsafe_lighting'
    severity:      { type: String, enum: ['low','medium','high', null], default: null },
    sentiment:     { type: String, enum: ['positive','neutral','negative', null], default: null },
    tags:          [String],
    processedAt:   { type: Date, default: null },
  },

  tags: [{ type: String, enum: [
    'well_lit', 'poorly_lit', 'crowded', 'deserted',
    'police_present', 'no_security', 'harassment_witnessed',
    'felt_safe', 'felt_unsafe', 'good_infrastructure',
    'good_network', 'poor_network', 'no_network',          // NEW network tags
  ]}],

  trsAtSubmission: { type: Number, default: 0.5 },
  isIncluded:      { type: Boolean, default: true },

  // Geolocation at time of submission (optional)
  submittedAt: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: undefined }
  },

  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

RatingSchema.index(
  { locationId: 1, userToken: 1, timeSlot: 1, createdAt: 1 },
  { partialFilterExpression: { isIncluded: true } }
);

// Compute rawSTI from factors using default weights (dynamic weights applied at aggregation time)
RatingSchema.pre('save', function(next) {
  this.rawSTI = Math.round(
    (0.30 * this.lighting
   + 0.30 * this.crowdBehavior
   + 0.20 * this.policeVisibility
   + 0.20 * (10 - this.incidentWeight)) * 10
  ) / 10;
  next();
});

module.exports = mongoose.model('Rating', RatingSchema);
