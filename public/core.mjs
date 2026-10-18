export const CATEGORIES = ['upper_body', 'outer', 'full_body', 'lower_body', 'shoes', 'auto'];
export const STORAGE_KEY = 'tryon-compare.metadata.v1';
const text = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
const price = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000 ? value : null;

// Only these fields may cross the persistent-storage boundary. Images and API URLs do not.
export function cleanCandidate(raw = {}) {
  return {
    name: text(raw?.name, 80),
    price: price(raw?.price),
    category: CATEGORIES.includes(raw?.category) ? raw.category : 'upper_body',
    preference: Number.isInteger(raw?.preference) && raw.preference >= 1 && raw.preference <= 5 ? raw.preference : 3,
    wardrobe: text(raw?.wardrobe, 180),
    decision: ['undecided', 'shortlist', 'skip'].includes(raw?.decision) ? raw.decision : 'undecided'
  };
}

export function cleanComparison(raw = {}) {
  return {
    version: 1,
    currency: ['USD', 'KRW', 'EUR'].includes(raw?.currency) ? raw.currency : 'USD',
    budget: price(raw?.budget),
    candidates: Array.isArray(raw?.candidates) ? raw.candidates.slice(0, 3).map(cleanCandidate) : []
  };
}

export function summarize(comparison) {
  const data = cleanComparison(comparison);
  const priced = data.candidates.filter(item => item.price !== null);
  return {
    cheapest: priced.length ? Math.min(...priced.map(item => item.price)) : null,
    shortlisted: data.candidates.filter(item => item.decision === 'shortlist').length,
    priced: priced.length,
    overBudget: data.budget === null ? 0 : priced.filter(item => item.price > data.budget).length
  };
}
