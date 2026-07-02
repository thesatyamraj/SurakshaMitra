/** Optional SMS. Native sms: deeplink is generated client-side (free);
 *  server-sent SMS via Twilio only if TWILIO_ENABLED=true. Stubs otherwise. */
function tryRequire(m){ try { return require(m); } catch { return null; } }

async function sendSOSSMS(phones, name, lat, lng, shareToken) {
  const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${shareToken}`;
  const body = `🚨 ${name} triggered an SOS. Live location: ${link}`;
  if (process.env.TWILIO_ENABLED !== 'true' || !process.env.TWILIO_ACCOUNT_SID) {
    console.log(`[SMS stub] → ${phones.join(', ')}: ${body}`); return { stub: true };
  }
  const twilio = tryRequire('twilio');
  if (!twilio) { console.warn('twilio not installed'); return { stub: true }; }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return Promise.all(phones.map(to =>
    client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to })
      .catch(e => console.warn('SMS failed:', e.message))));
}
module.exports = { sendSOSSMS };
