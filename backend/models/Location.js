const mongoose = require('mongoose');

// STI score sub-document per time slot
const TimeSlotSTISchema = new mongoose.Schema({
  slot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night'],
    required: true
  },
  sti: { type: Number, default: null, min: 0, max: 10 },
  category: { type: String, enum: ['safe', 'moderate', 'risky', 'unrated'], default: 'unrated' },
  ratingCount: { type: Number, default: 0 },
  avgLighting: { type: Number, default: null },
  avgCrowd: { type: Number, default: null },
  avgPolice: { type: Number, default: null },
  avgIncident: { type: Number, default: null },
  lastUpdated: { type: Date, default: null }
}, { _id: false });

const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  area: { type: String, trim: true },             // e.g. "Koramangala"
  city: { type: String, default: 'Bengaluru' },
  type: {
    type: String,
    enum: ['metro_station', 'bus_stop', 'market', 'park', 'road', 'residential', 'commercial', 'other'],
    default: 'other'
  },
  // GeoJSON point — enables MongoDB 2dsphere queries
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],   // [longitude, latitude]
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
        message: 'coordinates must be [lng, lat]'
      }
    }
  },
  timeSlots: {
    type: [TimeSlotSTISchema],
    default: () => [
      { slot: 'morning' },
      { slot: 'afternoon' },
      { slot: 'evening' },
      { slot: 'night' }
    ]
  },
  totalRatings: { type: Number, default: 0 },
  overallSTI: { type: Number, default: null },  // avg across all slots
  isVerified: { type: Boolean, default: false }, // admin-verified location
  tags: [String],                                // e.g. ["well_lit","police_patrol"]
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// 2dsphere index for geospatial queries
LocationSchema.index({ location: '2dsphere' });
LocationSchema.index({ city: 1, 'timeSlots.slot': 1 });
LocationSchema.index({ name: 'text', area: 'text' });

// Helper: get STI category from score
LocationSchema.statics.getCategory = function(sti) {
  if (sti === null || sti === undefined) return 'unrated';
  if (sti >= 8) return 'safe';
  if (sti >= 5) return 'moderate';
  return 'risky';
};

// Recompute overallSTI across all rated slots
LocationSchema.methods.recomputeOverall = function() {
  const rated = this.timeSlots.filter(s => s.sti !== null);
  if (rated.length === 0) {
    this.overallSTI = null;
  } else {
    this.overallSTI = Math.round((rated.reduce((s, r) => s + r.sti, 0) / rated.length) * 10) / 10;
  }
};

module.exports = mongoose.model('Location', LocationSchema);
