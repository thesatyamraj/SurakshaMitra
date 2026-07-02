const mongoose = require('mongoose');

const SOSEventSchema = new mongoose.Schema({
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  locationAtTrigger: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  locationHistory: [{
    coordinates: { type: [Number] }, // [lng, lat]
    timestamp:   { type: Date, default: Date.now },
  }],
  shareToken:  { type: String, required: true, unique: true }, // public, unguessable
  isActive:    { type: Boolean, default: true },
  notifiedContacts:   [{ type: String }],
  notifiedVolunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  audioClips:  [{ url: String, uploadedAt: { type: Date, default: Date.now } }],
  expiresAt:   { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

SOSEventSchema.index({ locationAtTrigger: '2dsphere' });
SOSEventSchema.index({ triggeredBy: 1, isActive: 1 });

module.exports = mongoose.model('SOSEvent', SOSEventSchema);
