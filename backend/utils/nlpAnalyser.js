/**
 * NLP Comment Analyser
 * Uses Gemini to extract incident type, severity and sentiment from rating comments.
 * Called asynchronously after rating submission — never blocks the response.
 */

const https = require('https');

const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Analyse a rating comment and return structured incident data.
 * Returns null if Gemini is unavailable or comment is too short.
 */
async function analyseComment(comment, { locationName, timeSlot } = {}) {
  if (!comment || comment.trim().length < 10) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are a safety incident classifier for a women's safety app in Bengaluru, India.

Analyse this user comment from a location safety rating:
Location: ${locationName || 'unknown'}
Time: ${timeSlot || 'unknown'}
Comment: "${comment}"

Reply ONLY with valid JSON in this exact format — no markdown, no explanation:
{
  "incidentType": "harassment" | "theft" | "unsafe_lighting" | "unsafe_crowd" | "infrastructure" | "general_safety" | "positive_experience" | null,
  "severity": "low" | "medium" | "high" | null,
  "sentiment": "positive" | "neutral" | "negative",
  "tags": ["tag1", "tag2"],
  "summary": "one sentence max"
}

Tags can be: eve_teasing, verbal_abuse, physical_threat, theft_attempt, dark_area, broken_lights, drunk_crowd, deserted, helpful_bystanders, police_patrolling, well_maintained, safe_feeling`;

  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
    });

    const path = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          // Strip markdown fences if present
          const clean = text.replace(/```json|```/g, '').trim();
          const result = JSON.parse(clean);
          resolve(result);
        } catch (e) {
          console.warn('NLP parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.warn('NLP request error:', e.message);
      resolve(null);
    });

    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

/**
 * Run NLP analysis on a rating document and save results.
 * Called via setImmediate — never awaited by the request handler.
 */
async function processRatingComment(ratingId, comment, context) {
  if (!comment || comment.trim().length < 10) return;
  try {
    const Rating = require('../models/Rating');
    const analysis = await analyseComment(comment, context);
    if (!analysis) return;

    await Rating.findByIdAndUpdate(ratingId, {
      nlpAnalysis: {
        incidentType: analysis.incidentType || null,
        severity:     analysis.severity     || null,
        sentiment:    analysis.sentiment    || 'neutral',
        tags:         Array.isArray(analysis.tags) ? analysis.tags.slice(0, 6) : [],
        processedAt:  new Date(),
      }
    });
    console.log(`🧠 NLP processed rating ${ratingId}: ${analysis.incidentType || 'no incident'}`);
  } catch (e) {
    console.warn('NLP processing failed for rating', ratingId, e.message);
  }
}

module.exports = { analyseComment, processRatingComment };
