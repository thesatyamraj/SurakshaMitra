/**
 * Unified User model.
 * Unified account, trust, notification, emergency, and volunteer fields.
 * SOS PIN is bcrypt-hashed (PRD §3.1 fix) — never stored or returned in plaintext.
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const MAX_EMERGENCY_CONTACTS = 5;

const emergencyContactSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid emergency contact email',
    },
  },
  phone: { type: String, required: true, trim: true },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name:  { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 50 },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
           match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  password: { type: String, required: true, minlength: [6, 'Min 6 chars'], select: false },
  avatar:   { type: String, default: null },
  phone:    { type: String, trim: true, default: '' },
  bloodGroup: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-',''], default: '' },
  medicalInfo:{ type: String, maxlength: 500, default: '' },
  city:     { type: String, trim: true, default: 'Bengaluru' },

  // ── Identity / auth ────────────────────────────────────────────────
  anonTokenHash: { type: String, default: null },
  isVerified:    { type: Boolean, default: false },
  role:          { type: String, enum: ['user','volunteer','moderator','admin'], default: 'user' },
  refreshToken:  { type: String, select: false, default: null },
  lastLogin:     { type: Date, default: null },
  googleId:      { type: String, sparse: true },
  authProvider:  { type: String, enum: ['local','google'], default: 'local' },

  // ── Emergency / SOS (from SurakshaMitra) ───────────────────────────
  emergencyContacts: {
    type: [emergencyContactSchema],
    validate: { validator: v => v.length <= MAX_EMERGENCY_CONTACTS,
                message: `Maximum ${MAX_EMERGENCY_CONTACTS} emergency contacts allowed` },
    default: [],
  },
  sosPIN: { type: String, default: '', select: false }, // bcrypt-hashed

  // ── Volunteer ──────────────────────────────────────────────────────
  isVolunteer:     { type: Boolean, default: false },
  volunteerRadius: { type: Number, min: 1, max: 10, default: 2 }, // km
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },

  // ── Push + notification prefs ──────────────────────────────────────
  pushSubscription: {
    endpoint: { type: String, default: null },
    keys: { p256dh: { type: String, default: null }, auth: { type: String, default: null } },
  },
  notifPrefs: {
    pushEnabled:    { type: Boolean, default: false },
    emailEnabled:   { type: Boolean, default: false },
    stiDropAlerts:  { type: Boolean, default: true },
    weeklyDigest:   { type: Boolean, default: true },
    zoneAlerts:     { type: Boolean, default: true },
    alertThreshold: { type: Number, default: 5, min: 0, max: 10 },
  },
  ratedLocationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],
}, { timestamps: true });

UserSchema.index({ location: '2dsphere' });

// Hash password AND sosPIN on save
UserSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(12));
  }
  if (this.isModified('sosPIN') && this.sosPIN) {
    // Only hash if it looks like a raw PIN (not an existing bcrypt hash)
    if (!/^\$2[aby]\$/.test(this.sosPIN)) {
      this.sosPIN = await bcrypt.hash(this.sosPIN, await bcrypt.genSalt(12));
    }
  }
  next();
});

UserSchema.methods.comparePassword = function(candidate) {
  return bcrypt.compare(candidate, this.password);
};
UserSchema.methods.compareSOSPIN = function(candidate) {
  if (!this.sosPIN) return true; // no PIN set → cancel allowed
  return bcrypt.compare(String(candidate || ''), this.sosPIN);
};
UserSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password; delete obj.anonTokenHash; delete obj.pushSubscription;
  delete obj.refreshToken; delete obj.sosPIN;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
