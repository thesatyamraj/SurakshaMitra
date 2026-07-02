const mongoose = require('mongoose');

const SafeZoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['police','hospital','shelter','other'], default: 'police' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  phone:   { type: String, default: '' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

SafeZoneSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SafeZone', SafeZoneSchema);
