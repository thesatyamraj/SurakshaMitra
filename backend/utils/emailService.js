/** Optional email service. Uses Brevo API if BREVO_API_KEY is set, otherwise SMTP. */
const https = require('https');

let transporter = null;
function tryRequire(m){ try { return require(m); } catch { return null; } }

function parseAddress(value, fallbackEmail = 'no-reply@surakshamitra.app') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim() || 'SurakshaMitra', email: match[2].trim() };
  return { name: 'SurakshaMitra', email: raw || fallbackEmail };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getSender() {
  return parseAddress(process.env.SMTP_FROM || process.env.BREVO_FROM || 'SurakshaMitra <no-reply@surakshamitra.app>');
}

function appBaseUrl() {
  const first = String(process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return first || 'http://localhost:3000';
}

function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = tryRequire('nodemailer');
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

function postBrevoEmail(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve({ ok: true, provider: 'brevo-api', statusCode: res.statusCode, data: parsed });
        }
        resolve({
          ok: false,
          provider: 'brevo-api',
          statusCode: res.statusCode,
          error: parsed?.message || data || `Brevo API returned ${res.statusCode}`,
        });
      });
    });
    req.on('error', e => resolve({ ok: false, provider: 'brevo-api', error: e.message }));
    req.write(body);
    req.end();
  });
}

async function sendViaBrevoApi({ toEmails, subject, html, text }) {
  const sender = getSender();
  const to = toEmails.filter(isEmail).map(email => ({ email }));
  if (!to.length) return { ok: false, provider: 'brevo-api', error: 'No valid recipient emails' };

  return postBrevoEmail({
    sender,
    to,
    subject,
    htmlContent: html,
    textContent: text,
  });
}

async function sendViaSmtp({ toEmails, subject, html, text }) {
  const t = getTransporter();
  if (!t) return null;
  const valid = toEmails.filter(isEmail);
  if (!valid.length) return { ok: false, provider: 'smtp', error: 'No valid recipient emails' };

  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || 'SurakshaMitra <no-reply@surakshamitra.app>',
      to: valid.join(','),
      subject,
      html,
      text,
    });
    return {
      ok: true,
      provider: 'smtp',
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response,
    };
  } catch (e) {
    return { ok: false, provider: 'smtp', error: e.message, code: e.code, response: e.response };
  }
}

async function sendSOSAlertEmail(toEmails, user, coords, shareToken) {
  const validEmails = (toEmails || []).filter(isEmail);
  const link = `${appBaseUrl()}/track/${shareToken}`;
  const mapsLink = Array.isArray(coords) && coords.length === 2
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;
  const subject = `🚨 ${user.name} triggered an SOS`;
  const text = `${user.name} triggered an SOS.

Open live tracking: ${link}
The map updates automatically every 3 seconds while the SOS is active.
Phone: ${user.phone || 'N/A'}
${mapsLink ? `Initial Google Maps point: ${mapsLink}` : ''}

If this looks urgent, call local emergency services immediately.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f6fb;font-family:Arial,Helvetica,sans-serif;color:#16182b;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;">
      <div style="background:#111327;border-radius:18px;overflow:hidden;border:1px solid #272b4a;">
        <div style="padding:22px 24px;background:#ff3b3b;color:#fff;">
          <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;">Emergency SOS Alert</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${user.name} needs help</h1>
        </div>
        <div style="padding:24px;color:#eae9f2;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">
            ${user.name} has triggered an SOS in SurakshaMitra. Open the live tracking map below.
            The location updates automatically every <strong>3 seconds</strong> while the SOS is active.
          </p>
          <a href="${link}" style="display:block;text-align:center;background:#ff3b3b;color:#fff;text-decoration:none;border-radius:12px;padding:15px 18px;font-weight:700;font-size:17px;margin:18px 0;">
            Open Live Location
          </a>
          <div style="background:#1b1f3a;border:1px solid #303655;border-radius:12px;padding:16px;margin-top:18px;">
            <div style="font-size:13px;color:#aeb2cf;margin-bottom:6px;">Tracking link</div>
            <a href="${link}" style="color:#9db8ff;word-break:break-all;">${link}</a>
          </div>
          <div style="display:grid;gap:10px;margin-top:18px;">
            <div style="background:#1b1f3a;border:1px solid #303655;border-radius:12px;padding:14px;">
              <strong>Phone:</strong> ${user.phone || 'N/A'}
            </div>
            ${mapsLink ? `<div style="background:#1b1f3a;border:1px solid #303655;border-radius:12px;padding:14px;"><strong>Initial map point:</strong> <a href="${mapsLink}" style="color:#9db8ff;">Open in Google Maps</a></div>` : ''}
          </div>
          <p style="margin:20px 0 0;color:#c9cbe0;line-height:1.55;">
            If this looks urgent, call local emergency services immediately and stay in contact with ${user.name}.
          </p>
        </div>
      </div>
      <p style="font-size:12px;color:#6b7194;text-align:center;margin:16px 0 0;">
        Sent by SurakshaMitra because you are saved as an emergency contact.
      </p>
    </div>
  </body>
</html>`;

  if (!validEmails.length) {
    console.warn('[Email] SOS alert skipped: no valid emergency contact emails.');
    return { ok: false, skipped: true, error: 'No valid recipient emails' };
  }

  let result;
  if (process.env.BREVO_API_KEY) result = await sendViaBrevoApi({ toEmails: validEmails, subject, html, text });
  else result = await sendViaSmtp({ toEmails: validEmails, subject, html, text });

  if (!result) {
    console.log(`[Email stub] SOS alert -> ${validEmails.join(', ')} | ${link}`);
    return { ok: true, stub: true };
  }

  if (result.ok) console.log(`[Email] SOS alert sent via ${result.provider} -> ${validEmails.join(', ')}`);
  else console.warn(`[Email] SOS alert failed via ${result.provider}:`, result.error || result.response || result);
  return result;
}

module.exports = { sendSOSAlertEmail, isEmail };
