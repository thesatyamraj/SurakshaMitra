/**
 * Notification — persisted record of every alert sent/queued.
 * Used for: in-app notification centre, delivery status tracking,
 *           weekly digest generation, deduplication.
 */
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'sti_drop',        // location you rated dropped below threshold
      'sti_improve',     // location improved significantly
      'zone_alert',      // real-time safety event in your area
      'incident_nearby', // new incident within ~2km of a rated location
      'weekly_digest',   // weekly summary email
      'system',          // platform announcements
    ],
  },
  title:   { type: String, required: true, maxlength: 120 },
  body:    { type: String, required: true, maxlength: 500 },
  url:     { type: String, default: null },   // deeplink, e.g. /map?loc=xxx

  // Context references
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
  incidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', default: null },

  // Delivery status
  channels: {
    push:   { sent: Boolean, sentAt: Date, error: String },
    email:  { sent: Boolean, sentAt: Date, error: String },
    socket: { sent: Boolean, sentAt: Date },
  },

  read:      { type: Boolean, default: false, index: true },
  readAt:    { type: Date,    default: null },
  createdAt: { type: Date,    default: Date.now, index: true },
}, { timestamps: false });

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
