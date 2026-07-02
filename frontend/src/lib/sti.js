export function categoryOf(sti) {
  if (sti == null) return 'unrated';
  if (sti >= 8) return 'safe';
  if (sti >= 5) return 'moderate';
  return 'risky';
}
export const CAT_COLOR = { safe: '#34D399', moderate: '#FBBF24', risky: '#FB7185', unrated: '#6B7194' };
export function currentSlot(d = new Date()) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}
export const SLOTS = ['morning', 'afternoon', 'evening', 'night'];
export const SLOT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' };
