const express = require("express");
const https = require("https");
const router = express.Router();

const DEFAULT_SYSTEM = `You are SurakshaMitra's safety assistant for women in India.
Answer the user's full question completely and practically.
For route questions, give a clear step-by-step route, safer transport options, safety checkpoints, and emergency precautions.
Keep the tone calm and helpful. Do not stop mid-sentence.`;

// ── Fallback responses ───────────────────────────────────────────────
// Matched by keywords in the user's last message.
// Add as many as you like!
const FALLBACKS = [
  {
    keywords: ["sti", "score", "calculated", "algorithm", "formula", "how is"],
    response: `The Safety Trust Index (STI) is a score from 0–10 calculated from four factors:\n\n💡 Street Lighting — 30%\n👥 Crowd Behaviour — 30%\n🚔 Police Visibility — 20%\n⚠️ Incident Reports — 20%\n\nScores above 8 are 🟢 Safe, 5–7 are 🟡 Moderate, and below 5 are 🔴 Risky. Scores also shift across four daily time slots since safety changes with light and footfall.`,
  },
  {
    keywords: ["night", "late", "dark", "after 9", "midnight", "alone"],
    response: `Travelling at night in Bengaluru — some tips:\n\n🚇 Metro is your safest bet — CCTV covered, women's coaches available\n🚗 Use app-based rides (Namma Yatri, Ola, Rapido) and share your trip live with someone you trust\n📍 Stick to well-lit, higher-footfall areas like Indiranagar, Koramangala, MG Road\n📞 Keep Women's Helpline 1091 saved — they respond quickly\n\nAlways check the SurakshaMitra map for the current Night slot STI before you head out! 🗺`,
  },
  {
    keywords: ["rate", "submit", "rating", "contribute", "add"],
    response: `Rating a location is quick and fully anonymous — no sign-up needed! 🔒\n\nJust:\n1. Click "📍 Rate a Location" in the top nav or home page\n2. Search for the place you visited\n3. Rate Lighting, Crowd, Police presence and any Incidents on a 1–10 scale\n4. Hit Submit — your rating instantly feeds into the community STI score\n\nEvery submission makes the map more accurate for every woman who follows. 💪`,
  },
  {
    keywords: ["trs", "trust", "reliable", "spam", "fake"],
    response: `SurakshaMitra uses a Trust Reliability Score (TRS) to keep ratings honest 🛡\n\nHere's how it works:\n• Everyone starts with a neutral trust level\n• Ratings that align with community consensus boost your TRS\n• Ratings that wildly deviate from consensus are down-weighted\n• A location needs a minimum number of ratings before its STI is published\n\nThis means one person can't skew a score — the system self-corrects over time.`,
  },
  {
    keywords: ["safe", "safest", "good area", "best area", "which area"],
    response: `Generally well-rated areas in Bengaluru for women:\n\n🟢 Indiranagar — well-lit, high footfall, active nightlife\n🟢 Koramangala — busy, lots of cafes and foot traffic\n🟢 HSR Layout — residential but well-patrolled\n🟢 MG Road / Brigade Road — central, busy, good lighting\n🟢 Whitefield IT hubs — security-heavy during work hours\n\nAlways cross-check with the live SurakshaMitra map for the current time slot — conditions change! 🗺`,
  },
  {
    keywords: ["auto", "cab", "uber", "ola", "rapido", "transport", "travel"],
    response: `Transport safety tips for Bengaluru 🚗\n\n✅ Prefer app-based autos/cabs — Namma Yatri, Ola, Rapido, Uber all have trip tracking\n✅ Share your live trip with a friend or family member\n✅ Check the driver's name and vehicle number before getting in\n✅ Sit behind the driver, not the passenger seat\n🚇 Metro is the safest option for night travel — women's coaches are available on all lines\n📞 Emergency: Women's Helpline 1091 | Police 100`,
  },
  {
    keywords: [
      "privacy",
      "anonymous",
      "data",
      "personal",
      "tracked",
      "account",
    ],
    response: `SurakshaMitra is built with privacy at its core 🔒\n\n• No account, email, or phone number needed — ever\n• All ratings are completely anonymous\n• No GPS tracking unless you explicitly choose to share your location\n• Your data is never sold or shared with third parties\n\nYou contribute safely, and others benefit safely.`,
  },
  {
    keywords: ["emergency", "help", "danger", "unsafe", "scared", "harass"],
    response: `If you feel unsafe right now, please reach out immediately 🆘\n\n📞 Women's Helpline — 1091 (24/7)\n📞 Police — 100\n📞 Bengaluru Police — 080-22943225\n📱 Bengaluru Police App — has a panic button feature\n\nGet to a well-lit, populated area if you can. You are not alone — the SurakshaMitra community is here to make Bengaluru safer for every woman. 💙`,
  },
  {
    keywords: ["time", "slot", "morning", "afternoon", "evening", "when"],
    response: `SurakshaMitra tracks safety across 4 time slots because conditions change throughout the day:\n\n🌅 Morning — 6 AM to 12 PM\n☀️ Afternoon — 12 PM to 6 PM\n🌆 Evening — 6 PM to 9 PM\n🌙 Night — 9 PM to 6 AM\n\nEach location has an independent STI score per slot — so a market that's 🟢 Safe in the afternoon might be 🟡 Moderate at night. Always check the current slot on the map!`,
  },
];

// Generic fallback if no keywords matched
const DEFAULT_FALLBACK = `I'm having a little trouble connecting to the AI right now, but I'm still here to help! 🛡\n\nYou can ask me about:\n• How the STI safety score works\n• Safe areas and transport tips in Bengaluru\n• How to rate a location\n• Privacy and anonymity\n• Emergency contacts\n\nOr explore the live Safety Map to check scores for specific locations right now 🗺`;

function getFallback(userMessage) {
  const lower = userMessage.toLowerCase();
  for (const entry of FALLBACKS) {
    if (entry.keywords.some((k) => lower.includes(k))) {
      return entry.response;
    }
  }
  return DEFAULT_FALLBACK;
}

// ── Route ────────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const { messages, system } = req.body;
  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";

  if (!apiKey) {
    console.warn("⚠️  No GEMINI_API_KEY — using fallback");
    return res.json({
      content: [{ type: "text", text: getFallback(lastUserMessage) }],
    });
  }

  console.log("🤖 Chat request received via Gemini");

  const geminiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const geminiBody = JSON.stringify({
    system_instruction: { parts: [{ text: system || DEFAULT_SYSTEM }] },
    contents: geminiMessages,
    generationConfig: {
      maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096),
      temperature: 0.6,
    },
  });

  const path = `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const options = {
    hostname: "generativelanguage.googleapis.com",
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(geminiBody),
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let data = "";
    proxyRes.on("data", (chunk) => {
      data += chunk;
    });
    proxyRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);

        if (proxyRes.statusCode !== 200) {
          console.warn(
            "⚠️  Gemini error",
            proxyRes.statusCode,
            "— using fallback",
          );
          return res.json({
            content: [{ type: "text", text: getFallback(lastUserMessage) }],
          });
        }

        const text = parsed?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim() || getFallback(lastUserMessage);
        res.json({ content: [{ type: "text", text }] });
      } catch (e) {
        console.warn("⚠️  Parse error — using fallback");
        res.json({
          content: [{ type: "text", text: getFallback(lastUserMessage) }],
        });
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.warn("⚠️  Network error — using fallback:", err.message);
    res.json({
      content: [{ type: "text", text: getFallback(lastUserMessage) }],
    });
  });

  proxyReq.write(geminiBody);
  proxyReq.end();
});

module.exports = router;
