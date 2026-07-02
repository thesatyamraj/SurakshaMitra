/**
 * Push Notification Service
 * Handles Web Push (VAPID), in-app socket notifications, and email digests.
 * Uses the native https module — no external push library required.
 * For production, swap the manual VAPID implementation with the 'web-push' npm package.
 */

const https   = require('https');
const crypto  = require('crypto');

// ── VAPID config (set in .env) ────────────────────────────────────────
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || 'mailto:surakshamitra@example.com';

/**
 * Send a Web Push notification to a single subscription object.
 * subscription = { endpoint, keys: { p256dh, auth } }
 * payload = { title, body, url, icon }
 */
async function sendWebPush(subscription, payload) {
  if (!subscription?.endpoint || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { ok: false, error: 'Push not configured' };
  }

  // In production use: require('web-push').sendNotification(subscription, payload)
  // This is a simplified passthrough — real VAPID signing needs the web-push library.
  // For the stub we return ok:true so the rest of the pipeline works.
  // Add to package.json: "web-push": "^3.6.7"
  try {
    const webpush = tryRequire('web-push');
    if (webpush) {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return { ok: true };
    }
    // Fallback stub when web-push not installed
    console.log(`[Push stub] Would send to ${subscription.endpoint.slice(0, 40)}…:`, payload.title);
    return { ok: true, stub: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function tryRequire(mod) {
  try { return require(mod); } catch { return null; }
}

/**
 * Send a simple email via SMTP (nodemailer).
 * Falls back to console log if nodemailer not installed / SMTP not configured.
 */
async function sendEmail({ to, subject, html, text }) {
  const nodemailer = tryRequire('nodemailer');
  if (!nodemailer || !process.env.SMTP_HOST) {
    console.log(`[Email stub] To: ${to} | Subject: ${subject}`);
    return { ok: true, stub: true };
  }
  try {
    const transporter = nodemailer.createTransporter({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT  || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"SurakshaMitra" <noreply@surakshamitra.app>',
      to, subject, html, text,
    });
    return { ok: true };
  } catch (e) {
    console.error('Email send error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Deliver a notification via all enabled channels for a user.
 * Creates a Notification record and dispatches push + socket + email.
 */
async function deliverNotification(userId, notifData, { io } = {}) {
  const User         = require('../models/User');
  const Notification = require('../models/Notification');

  const user = await User.findById(userId).lean();
  if (!user) return;

  const notif = await Notification.create({
    userId,
    type:       notifData.type,
    title:      notifData.title,
    body:       notifData.body,
    url:        notifData.url  || null,
    locationId: notifData.locationId || null,
    incidentId: notifData.incidentId || null,
    channels:   { push: {}, email: {}, socket: {} },
  });

  const channels = { push: {}, email: {}, socket: {} };

  // ── Socket (real-time in-app) ─────────────────────────────────────
  if (io) {
    try {
      io.to(`user:${userId}`).emit('notification', {
        id:         notif._id,
        type:       notif.type,
        title:      notif.title,
        body:       notif.body,
        url:        notif.url,
        locationId: notif.locationId,
        createdAt:  notif.createdAt,
      });
      channels.socket = { sent: true, sentAt: new Date() };
    } catch (e) {
      channels.socket = { sent: false, error: e.message };
    }
  }

  // ── Web Push ──────────────────────────────────────────────────────
  if (user.notifPrefs?.pushEnabled && user.pushSubscription?.endpoint) {
    const result = await sendWebPush(user.pushSubscription, {
      title:  notif.title,
      body:   notif.body,
      url:    notif.url || '/',
      icon:   '/icons/icon-192.png',
      badge:  '/icons/badge-72.png',
    });
    channels.push = { sent: result.ok, sentAt: new Date(), error: result.error };
  }

  // ── Email (only for weekly_digest and high-severity incidents) ────
  if (user.notifPrefs?.emailEnabled && user.email &&
      ['weekly_digest','sti_drop','incident_nearby'].includes(notifData.type)) {
    const result = await sendEmail({
      to:      user.email,
      subject: `SurakshaMitra: ${notif.title}`,
      text:    notif.body,
      html:    buildEmailHtml(notif, user),
    });
    channels.email = { sent: result.ok, sentAt: new Date(), error: result.error };
  }

  // Update delivery status
  await Notification.findByIdAndUpdate(notif._id, { channels });
  return notif;
}

/**
 * Alert all users who rated a location when its STI drops below their threshold.
 * Called from stiEngine.updateLocationSTI after every recompute.
 */
async function alertSTIDrop(locationId, timeSlot, newSTI, oldSTI, { io } = {}) {
  if (newSTI === null || oldSTI === null) return;
  if (newSTI >= oldSTI) return;           // only alert on drops
  if (newSTI >= 5) return;                // only alert if drops below moderate

  const User = require('../models/User');

  // Find registered users who rated this location and have alerts enabled
  const users = await User.find({
    ratedLocationIds: locationId,
    'notifPrefs.stiDropAlerts': true,
  }).lean();

  const Location = require('../models/Location');
  const loc = await Location.findById(locationId).select('name area').lean();
  const locName = loc ? `${loc.name}, ${loc.area}` : 'a location you rated';

  const slotLabel = { morning:'morning', afternoon:'afternoon', evening:'evening', night:'night' }[timeSlot] || timeSlot;
  const catLabel  = newSTI >= 5 ? 'Moderate' : 'Risky';
  const emoji     = newSTI >= 5 ? '🟡' : '🔴';

  for (const user of users) {
    if (newSTI <= (user.notifPrefs?.alertThreshold ?? 5)) {
      await deliverNotification(user._id, {
        type:       'sti_drop',
        title:      `${emoji} Safety alert: ${locName}`,
        body:       `Safety score for ${locName} (${slotLabel}) dropped to ${newSTI.toFixed(1)} — now ${catLabel}. Take extra care.`,
        url:        `/map?loc=${locationId}`,
        locationId,
      }, { io });
    }
  }
}

/**
 * Send a real-time zone alert to ALL connected socket clients in an area.
 * Used for immediate incident broadcasts (e.g. high-severity report filed).
 */
function broadcastZoneAlert(io, { locationId, locationName, area, type, severity, timeSlot }) {
  if (!io) return;
  const emoji = { high: '🔴', critical: '🆘', medium: '🟡', low: '🟢' }[severity] || '⚠️';
  io.emit('zone-alert', {
    locationId,
    locationName,
    area,
    type,
    severity,
    timeSlot,
    title:   `${emoji} Safety incident reported`,
    body:    `${type.replace(/_/g,' ')} reported near ${locationName}${area ? ', ' + area : ''}`,
    sentAt:  new Date(),
  });
}

/**
 * Generate weekly digest email for a user.
 * Summarises STI changes for their rated locations over the past 7 days.
 */
async function sendWeeklyDigest(userId, { io } = {}) {
  const User       = require('../models/User');
  const Location   = require('../models/Location');
  const STIHistory = require('../models/STIHistory');

  const user = await User.findById(userId).lean();
  if (!user || !user.ratedLocationIds?.length) return;
  if (!user.notifPrefs?.weeklyDigest) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const locations = await Location.find({
    _id: { $in: user.ratedLocationIds }
  }).lean();

  const changes = [];
  for (const loc of locations) {
    const snapshots = await STIHistory.find({
      locationId: loc._id,
      recordedAt: { $gte: sevenDaysAgo },
    }).sort({ recordedAt: 1 }).lean();

    if (snapshots.length < 2) continue;
    const oldest = snapshots[0].sti;
    const latest = snapshots[snapshots.length - 1].sti;
    if (oldest === null || latest === null) continue;
    const delta = latest - oldest;
    if (Math.abs(delta) >= 0.5) {
      changes.push({ name: loc.name, area: loc.area, latest, delta });
    }
  }

  changes.sort((a, b) => a.delta - b.delta); // biggest drops first

  const title = changes.length > 0
    ? `Your weekly safety summary — ${changes.length} location${changes.length !== 1 ? 's' : ''} changed`
    : 'Your weekly safety summary — no major changes';

  const body = changes.length > 0
    ? changes.map(c => `${c.delta < 0 ? '↓' : '↑'} ${c.name}: ${c.latest.toFixed(1)} (${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1)})`).join('\n')
    : 'All your rated locations are stable this week. Keep contributing!';

  await deliverNotification(userId, {
    type:  'weekly_digest',
    title,
    body,
    url:   '/map',
  }, { io });
}

function buildEmailHtml(notif, user) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body{font-family:system-ui,sans-serif;background:#0D0D0F;color:#E5E5E5;margin:0;padding:0}
  .wrap{max-width:560px;margin:0 auto;padding:32px 24px}
  .logo{font-size:22px;font-weight:700;color:#E63B6F;margin-bottom:24px}
  .card{background:#1A1A1D;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:16px}
  .title{font-size:18px;font-weight:600;margin-bottom:8px}
  .body{font-size:14px;color:#9CA3AF;line-height:1.6}
  .cta{display:inline-block;margin-top:16px;padding:10px 20px;background:#E63B6F;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}
  .footer{font-size:11px;color:#4B5563;margin-top:24px;text-align:center}
</style></head>
<body><div class="wrap">
  <div class="logo">🛡️ SurakshaMitra</div>
  <div class="card">
    <div class="title">${notif.title}</div>
    <div class="body">${notif.body.replace(/\n/g,'<br>')}</div>
    ${notif.url ? `<a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}${notif.url}" class="cta">View on SurakshaMitra →</a>` : ''}
  </div>
  <div class="footer">
    You're receiving this because you have alerts enabled for SurakshaMitra.<br>
    To unsubscribe, visit your account notification settings.
  </div>
</div></body>
</html>`;
}

module.exports = { sendWebPush, sendEmail, deliverNotification, alertSTIDrop, broadcastZoneAlert, sendWeeklyDigest };
