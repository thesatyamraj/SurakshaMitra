/** Geo helpers: haversine distance + nearby-volunteer / nearest-safezone queries. */
const User     = require('../models/User');
const SafeZone = require('../models/SafeZone');

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 100) / 100;
}

/** Volunteers within `radiusKm` of [lng,lat], excluding the triggering user. */
async function findNearbyVolunteers(lng, lat, radiusKm = 5, excludeId = null) {
  try {
    const q = {
      isVolunteer: true,
      location: { $nearSphere: { $geometry: { type: 'Point', coordinates: [lng, lat] },
                                 $maxDistance: radiusKm * 1000 } },
    };
    if (excludeId) q._id = { $ne: excludeId };
    const volunteers = await User.find(q).select('name phone location').limit(50).lean();
    return volunteers.map(v => ({
      ...v,
      distance: haversineKm(lat, lng, v.location.coordinates[1], v.location.coordinates[0]),
    }));
  } catch (e) { console.warn('findNearbyVolunteers error:', e.message); return []; }
}

/** Nearest safe zone (police/hospital) to [lng,lat]. */
async function nearestSafeZone(lng, lat, type = null) {
  try {
    const q = { location: { $nearSphere: { $geometry: { type: 'Point', coordinates: [lng, lat] } } } };
    if (type) q.type = type;
    const z = await SafeZone.findOne(q).lean();
    if (!z) return null;
    return { ...z, distance: haversineKm(lat, lng, z.location.coordinates[1], z.location.coordinates[0]) };
  } catch (e) { console.warn('nearestSafeZone error:', e.message); return null; }
}

module.exports = { haversineKm, findNearbyVolunteers, nearestSafeZone };
