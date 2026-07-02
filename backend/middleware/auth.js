/**
 * Unified auth middleware (PRD §6-A).
 *   - Registered users: JWT ACCESS token (short-lived) → sets req.userId + req.userRole + req.userToken
 *   - Anonymous users : long-lived anon JWT → sets req.userToken only
 *   - No/invalid token: issues a fresh 90-day anon token in the X-Auth-Token response header
 * Always guarantees req.userToken (sha-256 hash of the bearer token) is set.
 */
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'suraksha_dev_secret_change_me';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Registered user access token
      if (decoded.userId) {
        req.userId    = decoded.userId;
        req.userToken = hashToken(token);
        req.isNewToken = false;
        try {
          const User = require('../models/User');
          const u = await User.findById(decoded.userId).select('role').lean();
          req.userRole = u?.role || 'user';
        } catch { req.userRole = 'user'; }
        return next();
      }
      // Anonymous token
      if (decoded.anonId) {
        req.userToken = hashToken(token);
        req.isNewToken = false;
        req.userRole = 'anon';
        return next();
      }
    } catch (err) {
      // Expired access token → tell client to refresh (registered flow)
      if (err.name === 'TokenExpiredError') {
        const payload = jwt.decode(token);
        if (payload?.userId) {
          return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', error: 'Access token expired' });
        }
      }
      // otherwise fall through to issue a new anon token
    }
  }

  // Issue a fresh anonymous identity
  const anonId   = uuidv4();
  const newToken = jwt.sign({ anonId }, JWT_SECRET, { expiresIn: '90d' });
  res.setHeader('X-Auth-Token', newToken);
  req.userToken  = hashToken(newToken);
  req.isNewToken = true;
  req.userRole   = 'anon';
  next();
}

/** Require a logged-in registered user (any role). Use after authMiddleware. */
function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ success: false, error: 'Login required for this action.' });
  next();
}

/** Role guard. requireRole('moderator','admin'). Use after authMiddleware. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userId) return res.status(401).json({ success: false, error: 'Login required.' });
    if (!roles.includes(req.userRole)) return res.status(403).json({ success: false, error: 'Insufficient permissions.' });
    next();
  };
}

module.exports = { authMiddleware, requireAuth, requireRole, hashToken };
