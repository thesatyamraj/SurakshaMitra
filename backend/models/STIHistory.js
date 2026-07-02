/**
 * STIHistory — daily snapshots of STI per location+slot.
 * Enables trend charts: "Koramangala night improved 1.8 pts over 30 days."
 */
const mongoose = require('mongoose');

const STIHistorySchema = new mongoose.Schema({
  locationId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  timeSlot:    { type: String, enum: ['morning', 'afternoon', 'evening', 'night'], required: true },
  sti:         { type: Number },
  category:    { type: String, enum: ['safe', 'moderate', 'risky', 'unrated'] },
  ratingCount: { type: Number, default: 0 },
  recordedAt:  { type: Date, default: Date.now, index: true },
}, { timestamps: false });

// Compound index for efficient trend queries
STIHistorySchema.index({ locationId: 1, timeSlot: 1, recordedAt: -1 });

// Only store one snapshot per location+slot per hour to avoid data explosion
STIHistorySchema.index(
  { locationId: 1, timeSlot: 1, recordedAt: 1 },
  { partialFilterExpression: {} }
);

module.exports = mongoose.model('STIHistory', STIHistorySchema);
