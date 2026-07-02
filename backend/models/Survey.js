const mongoose = require('mongoose');

const SurveySchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true,
  },
  userToken: { type: String, required: true, index: true },
  timeSlot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night'],
    required: true,
  },
  lighting: { type: Number, required: true, min: 1, max: 10 },
  crowdDensity: { type: Number, required: true, min: 1, max: 10 },
  publicTransport: { type: Number, required: true, min: 1, max: 10 },
  incidentFrequency: { type: Number, required: true, min: 0, max: 10 },
  overallRating: { type: Number, required: true, min: 1, max: 10 },
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

SurveySchema.index({ locationId: 1, timeSlot: 1 });

module.exports = mongoose.model('Survey', SurveySchema);
