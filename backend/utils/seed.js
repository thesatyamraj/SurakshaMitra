/**
 * Seed script: populates Bengaluru locations with real coordinates
 * and demo ratings so the map renders immediately.
 *
 * Run: node utils/seed.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Location = require('../models/Location');
const Rating = require('../models/Rating');
const UserTrust = require('../models/UserTrust');
const { updateLocationSTI } = require('./stiEngine');
const User     = require('../models/User');
const SafeZone = require('../models/SafeZone');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/surakshamitra';

// ── Real Bengaluru locations with coordinates ──────────────────────
const LOCATIONS = [
  // Metro Stations
  { name: 'MG Road Metro Station', area: 'MG Road', type: 'metro_station', coordinates: [77.6057, 12.9752] },
  { name: 'Indiranagar Metro Station', area: 'Indiranagar', type: 'metro_station', coordinates: [77.6409, 12.9719] },
  { name: 'Koramangala Metro (Upcoming)', area: 'Koramangala', type: 'metro_station', coordinates: [77.6245, 12.9279] },
  { name: 'Majestic / KSR Railway Station', area: 'Majestic', type: 'metro_station', coordinates: [77.5713, 12.9767] },
  { name: 'Whitefield Metro Station', area: 'Whitefield', type: 'metro_station', coordinates: [77.7480, 12.9698] },
  { name: 'Silk Board Metro Station', area: 'Silk Board', type: 'metro_station', coordinates: [77.6218, 12.9174] },
  { name: 'Yelahanka Metro Station', area: 'Yelahanka', type: 'metro_station', coordinates: [77.5942, 13.1013] },

  // Bus Stops
  { name: 'Shivajinagar Bus Stand', area: 'Shivajinagar', type: 'bus_stop', coordinates: [77.5946, 12.9856] },
  { name: 'Kempegowda Bus Station (Majestic)', area: 'Majestic', type: 'bus_stop', coordinates: [77.5722, 12.9787] },
  { name: 'BTM Layout Bus Stop', area: 'BTM Layout', type: 'bus_stop', coordinates: [77.6101, 12.9165] },
  { name: 'Hebbal Flyover Bus Stop', area: 'Hebbal', type: 'bus_stop', coordinates: [77.5953, 13.0351] },

  // Markets & Commercial
  { name: 'Commercial Street', area: 'Shivajinagar', type: 'commercial', coordinates: [77.6072, 12.9819] },
  { name: 'Brigade Road', area: 'MG Road', type: 'commercial', coordinates: [77.6073, 12.9719] },
  { name: 'Chickpete Market', area: 'Chickpete', type: 'market', coordinates: [77.5762, 12.9668] },
  { name: 'KR Market (City Market)', area: 'Kalasipalya', type: 'market', coordinates: [77.5741, 12.9642] },
  { name: 'Russell Market', area: 'Shivajinagar', type: 'market', coordinates: [77.5990, 12.9831] },
  { name: 'Jayanagar 4th Block Market', area: 'Jayanagar', type: 'market', coordinates: [77.5835, 12.9258] },
  { name: 'Malleshwaram Market', area: 'Malleshwaram', type: 'market', coordinates: [77.5685, 13.0031] },
  { name: 'Forum Mall, Koramangala', area: 'Koramangala', type: 'commercial', coordinates: [77.6101, 12.9322] },
  { name: 'Phoenix Marketcity, Whitefield', area: 'Whitefield', type: 'commercial', coordinates: [77.7126, 12.9965] },

  // Parks
  { name: 'Cubbon Park', area: 'Cubbon Park', type: 'park', coordinates: [77.5930, 12.9763] },
  { name: 'Lalbagh Botanical Garden', area: 'Lalbagh', type: 'park', coordinates: [77.5840, 12.9507] },
  { name: 'Ulsoor Lake', area: 'Ulsoor', type: 'park', coordinates: [77.6203, 12.9799] },
  { name: 'Bannerghatta Road Park', area: 'Bannerghatta', type: 'park', coordinates: [77.5910, 12.8704] },

  // Roads / Areas
  { name: 'Residency Road', area: 'MG Road', type: 'road', coordinates: [77.6012, 12.9714] },
  { name: 'Outer Ring Road (Marathahalli)', area: 'Marathahalli', type: 'road', coordinates: [77.7025, 12.9562] },
  { name: 'Hosur Road (Bommanahalli)', area: 'Bommanahalli', type: 'road', coordinates: [77.6257, 12.9059] },
  { name: 'Old Airport Road', area: 'Varthur', type: 'road', coordinates: [77.6886, 12.9629] },
  { name: 'Domlur Flyover', area: 'Domlur', type: 'road', coordinates: [77.6378, 12.9614] },

  // Residential / Neighbourhood
  { name: 'HSR Layout Sector 7', area: 'HSR Layout', type: 'residential', coordinates: [77.6381, 12.9082] },
  { name: 'Marathahalli Bridge', area: 'Marathahalli', type: 'road', coordinates: [77.7012, 12.9592] },
  { name: 'Electronic City Phase 1', area: 'Electronic City', type: 'commercial', coordinates: [77.6659, 12.8399] },
  { name: 'Rajajinagar Market', area: 'Rajajinagar', type: 'market', coordinates: [77.5555, 12.9912] },
  { name: 'Frazer Town', area: 'Frazer Town', type: 'residential', coordinates: [77.6127, 12.9865] },
];

// ── Demo ratings distribution (realistic) ─────────────────────────
const SLOT_PROFILES = {
  // [lighting, crowd, police, incident]   — [min, max] per factor
  morning: { L: [6, 9], C: [5, 8], P: [4, 7], I: [1, 3] },
  afternoon: { L: [8, 10], C: [6, 9], P: [5, 8], I: [1, 2] },
  evening: { L: [4, 8], C: [5, 9], P: [3, 6], I: [2, 5] },
  night: { L: [2, 6], C: [2, 6], P: [2, 5], I: [3, 8] },
};

// Some locations are inherently safer (parks, malls) vs riskier (isolated roads)
const SAFETY_MODIFIER = {
  metro_station: 0,
  bus_stop: -1,
  market: 0,
  park: +1,
  road: -2,
  residential: +1,
  commercial: +1,
  other: 0
};

function rand(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

async function seed() {

  // Clear existing
  await Location.deleteMany({ city: 'Bengaluru' });
  await Rating.deleteMany({});
  await UserTrust.deleteMany({});
  console.log('🗑  Cleared existing data');

  // Demo user tokens
  const demoUsers = Array.from({ length: 20 }, (_, i) => `demo_user_hash_${i}`);

  for (const loc of LOCATIONS) {
    // Create location
    const location = new Location({
      name: loc.name,
      area: loc.area,
      type: loc.type,
      city: 'Bengaluru',
      location: { type: 'Point', coordinates: loc.coordinates },
      isVerified: true
    });
    await location.save();

    const mod = SAFETY_MODIFIER[loc.type] || 0;

    // Generate demo ratings for each slot
    for (const [slot, profile] of Object.entries(SLOT_PROFILES)) {
      const numRatings = rand(4, 25);
      for (let i = 0; i < numRatings; i++) {
        const user = demoUsers[rand(0, demoUsers.length - 1)];
        const L = clamp(rand(profile.L[0], profile.L[1]) + mod, 1, 10);
        const C = clamp(rand(profile.C[0], profile.C[1]) + mod, 1, 10);
        const P = clamp(rand(profile.P[0], profile.P[1]) + mod, 1, 10);
        const I = clamp(rand(profile.I[0], profile.I[1]) - mod, 0, 10);

        const rating = new Rating({
          locationId: location._id,
          userToken: user,
          timeSlot: slot,
          lighting: L,
          crowdBehavior: C,
          policeVisibility: P,
          incidentWeight: I,
          isIncluded: true
        });
        await rating.save();
      }

      // Compute STI for this slot
      await updateLocationSTI(location._id, slot);
    }

    console.log(`📍 Seeded: ${loc.name}`);
  }

  // Seed demo user trust scores
  for (const token of demoUsers) {
    const trs = 0.4 + Math.random() * 0.55;
    const UserTrustModel = require('../models/UserTrust');
    await UserTrustModel.findOneAndUpdate(
      { tokenHash: token },
      { trs, totalRatings: rand(5, 40), isFlagged: trs < 0.3 },
      { upsert: true }
    );
  }


  // ── Seed an admin user + safe zones ────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@surakshamitra.app';
  const adminPass  = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({ name: 'Admin', email: adminEmail, password: adminPass, role: 'admin', isVerified: true });
    console.log(`\n👤 Admin seeded: ${adminEmail} / ${adminPass}  (change in production)`);
  }

  const SAFE_ZONES = [
    { name: 'Cubbon Park Police Station', type: 'police',   coordinates: [77.5946, 12.9764], phone: '080-22942444' },
    { name: 'Indiranagar Police Station', type: 'police',   coordinates: [77.6410, 12.9716], phone: '080-25201000' },
    { name: 'Koramangala Police Station', type: 'police',   coordinates: [77.6270, 12.9330], phone: '080-25534000' },
    { name: 'Bowring Hospital',           type: 'hospital', coordinates: [77.6030, 12.9830], phone: '080-25591362' },
    { name: 'Victoria Hospital',          type: 'hospital', coordinates: [77.5730, 12.9620], phone: '080-26701150' },
  ];
  for (const z of SAFE_ZONES) {
    await SafeZone.findOneAndUpdate(
      { name: z.name },
      { name: z.name, type: z.type, phone: z.phone, location: { type: 'Point', coordinates: z.coordinates } },
      { upsert: true }
    );
  }
  console.log(`🚔 Safe zones seeded: ${SAFE_ZONES.length}`);

  console.log('\n🎉 Seed complete!');
  console.log(`   Locations: ${LOCATIONS.length}`);
}

// When run directly: connect → seed → disconnect
if (require.main === module) {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      return seed();
    })
    .then(() => mongoose.disconnect())
    .then(() => {
      console.log('🔌 Disconnected. Done!');
      process.exit(0);
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
