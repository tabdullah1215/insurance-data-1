// Simulates a JSON export from MongoDB of insurance claim documents.
// In the real role, this data would arrive as nested JSON from a Mongo collection;
// here we generate it deterministically so the app behaves the same on every run.

const LINES_OF_BUSINESS = ['Auto', 'Homeowners', 'Commercial', 'Workers Comp']
const STATES = ['IL', 'TX', 'CA', 'FL', 'NY', 'OH', 'PA', 'GA', 'NC', 'MI']
const STATUSES = ['Open', 'Closed', 'Reopened']

const FIRST_ACCIDENT_YEAR = 2015
const LAST_ACCIDENT_YEAR = 2024

// A tiny seeded PRNG (mulberry32) so the dataset is identical across reloads.
// Deterministic data makes performance comparisons and debugging reliable.
function makeRng(seed) {
  let a = seed
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/**
 * Generate `count` claim records.
 *
 * Each record carries the fields an actuarial tool cares about:
 *  - accidentYear / developmentLag: position in a loss-development triangle
 *  - earnedPremium: what the policy brought in
 *  - paidLoss / reserve / incurredLoss: the loss picture (incurred = paid + reserve)
 */
export function generateClaims(count = 50000, seed = 42) {
  const rng = makeRng(seed)
  const claims = new Array(count)

  for (let i = 0; i < count; i++) {
    const lineOfBusiness = pick(rng, LINES_OF_BUSINESS)
    const accidentYear =
      FIRST_ACCIDENT_YEAR +
      Math.floor(rng() * (LAST_ACCIDENT_YEAR - FIRST_ACCIDENT_YEAR + 1))

    // A claim can only develop up to the current (last) year.
    const maxLag = LAST_ACCIDENT_YEAR - accidentYear
    const developmentLag = Math.floor(rng() * (maxLag + 1))
    const reportYear = accidentYear + developmentLag

    // Different lines of business carry different typical severities.
    const severityBase =
      lineOfBusiness === 'Workers Comp'
        ? 18000
        : lineOfBusiness === 'Commercial'
          ? 12000
          : lineOfBusiness === 'Homeowners'
            ? 9000
            : 6000

    const incurredLoss = round2(severityBase * (0.2 + rng() * 2.5))
    // Older claims have paid out more of their incurred amount.
    const paidRatio = Math.min(1, 0.3 + developmentLag * 0.15 + rng() * 0.2)
    const paidLoss = round2(incurredLoss * paidRatio)
    const reserve = round2(incurredLoss - paidLoss)

    // Premium loosely scales with severity so loss ratios land in a believable range.
    const earnedPremium = round2(severityBase * (0.6 + rng() * 0.6))

    claims[i] = {
      id: `CLM-${(i + 1).toString().padStart(7, '0')}`,
      policyNumber: `POL-${Math.floor(rng() * 900000 + 100000)}`,
      lineOfBusiness,
      state: pick(rng, STATES),
      accidentYear,
      reportYear,
      developmentLag,
      earnedPremium,
      paidLoss,
      reserve,
      incurredLoss,
      claimStatus: pick(rng, STATUSES),
    }
  }

  return claims
}
