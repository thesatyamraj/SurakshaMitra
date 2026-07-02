const mongoose = require('mongoose');

const UserTrustSchema = new mongoose.Schema({
  // Hashed token fingerprint — never store raw JWT
  tokenHash: { type: String, required: true, unique: true, index: true },

  // Trust Reliability Score: 0.0 – 1.0
  trs: { type: Number, default: 0.5, min: 0, max: 1 },

  totalRatings: { type: Number, default: 0 },
  consensusMatches: { type: Number, default: 0 },   // ratings within ±2 of location consensus
  flaggedRatings: { type: Number, default: 0 },      // outlier ratings

  // Is this user blocked from contributing?
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String, default: null },

  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Recompute TRS based on consensus match ratio
UserTrustSchema.methods.recomputeTRS = function() {
  if (this.totalRatings < 3) {
    // Not enough data — keep neutral
    this.trs = 0.5;
    return;
  }
  const ratio = this.consensusMatches / this.totalRatings;
  // Scale: 0.1 (all outliers) → 0.98 (perfect consensus)
  this.trs = Math.max(0.1, Math.min(0.98, ratio));
  // Flag users consistently below 0.3
  this.isFlagged = this.trs < 0.3 && this.totalRatings >= 5;
};

module.exports = mongoose.model('UserTrust', UserTrustSchema);
