const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User      = require('../models/User');
const { hashToken, authMiddleware, requireAuth } = require('../middleware/auth');

const JWT_SECRET         = process.env.JWT_SECRET || 'suraksha_dev_secret_change_me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'suraksha_refresh_secret_change_me';
const ACCESS_EXPIRES     = process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXPIRES    = process.env.JWT_REFRESH_EXPIRES || '7d';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, error: 'Too many auth attempts. Try again in 15 minutes.' },
});

const signAccess  = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
const signRefresh = (userId) => jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

async function sendAuth(res, user, status = 200) {
  const accessToken  = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  res.status(status).json({ success: true, accessToken, refreshToken, user: user.toSafeObject() });
}

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, anonToken } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, error: 'Name, email and password are required.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });

    const data = { name: name.trim(), email: email.toLowerCase().trim(), password };
    if (anonToken) data.anonTokenHash = hashToken(anonToken); // link prior anon ratings

    // In production you'd email a verification link; demo auto-verifies unless NODE_ENV=production
    data.isVerified = process.env.NODE_ENV !== 'production';

    const user = await User.create(data);
    await sendAuth(res, user, 201);
  } catch (err) {
    if (err.name === 'ValidationError')
      return res.status(400).json({ success: false, error: Object.values(err.errors).map(e => e.message).join(', ') });
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Server error during signup.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    user.lastLogin = new Date();
    await sendAuth(res, user);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// POST /api/auth/refresh  — swap a valid refresh token for a fresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token required.' });

    let decoded;
    try { decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET); }
    catch { return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' }); }

    const user = await User.findById(decoded.userId).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken)
      return res.status(401).json({ success: false, error: 'Refresh token revoked.' });

    res.json({ success: true, accessToken: signAccess(user._id) });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/logout — revoke the refresh token
router.post('/logout', authMiddleware, requireAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { refreshToken: null });
  res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
  res.json({ success: true, user: user.toSafeObject() });
});

// PATCH /api/auth/me — update contacts / volunteer / PIN / location / profile
router.patch('/me', authMiddleware, requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+sosPIN');
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const allowed = ['name','phone','bloodGroup','medicalInfo','city','avatar',
                     'isVolunteer','volunteerRadius','notifPrefs'];
    for (const k of allowed) if (req.body[k] !== undefined) user[k] = req.body[k];

    if (req.body.emergencyContacts !== undefined) {
      if (!Array.isArray(req.body.emergencyContacts)) {
        return res.status(400).json({ success: false, error: 'Emergency contacts must be a list.' });
      }
      user.emergencyContacts = req.body.emergencyContacts.map(c => ({
        name: String(c.name || '').trim(),
        phone: String(c.phone || '').trim(),
        email: String(c.email || '').trim().toLowerCase(),
      })).filter(c => c.name && c.phone);
    }

    if (req.body.sosPIN) user.sosPIN = String(req.body.sosPIN); // re-hashed by pre-save hook
    if (req.body.location?.coordinates) {
      user.location = { type: 'Point', coordinates: req.body.location.coordinates };
    }
    if (user.isVolunteer && user.role === 'user') user.role = 'volunteer';

    await user.save();
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
