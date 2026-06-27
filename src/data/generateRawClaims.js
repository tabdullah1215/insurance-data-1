// ============================================================================
// RAW (jagged) claim documents — simulates a messy MongoDB export.
//
// Unlike generateClaims.js (which is already clean), this generator deliberately
// plants edge cases so you can practice every ingestion/shaping technique.
// It favors VARIETY over volume: ~250 base docs (+ duplicates), seeded so the
// mess is identical on every run.
//
// ---------------------------------------------------------------------------
// DIRTY-DATA PROFILE — the anomalies your normalizer must handle.
// (In real life you'd discover these by profiling the collection. Here's the
//  "report" so you have a checklist; the FIX is your job, not the generator's.)
//
//  DEFAULTS (missing field implies a value)
//   - `reserve` may be missing/null            -> default 0
//   - `currency` may be missing                 -> default "USD"
//   - status may be missing                     -> default "Open"
//   - `closedDate` ABSENT implies an open claim (presence => closed)
//   - `reopened` ABSENT implies false
//
//  TYPE CHECKING / POLYMORPHIC (type varies by condition)
//   - `policy` is sometimes an OBJECT {number, holder:{...}}, sometimes a STRING
//   - `payments` is sometimes an ARRAY of numbers, sometimes a single NUMBER,
//     sometimes absent (then derive paid loss from elsewhere)
//   - `loss` is sometimes a NUMBER (incurred) and sometimes an OBJECT {paid,reserve}
//   - amounts arrive as number | "1,234.56" | "$2,000" | null | cents-integer
//   - booleans arrive as true/false | "Y"/"N" | 1/0 | "true"/"false"
//
//  COERCION
//   - money strings -> number; "Y"/"N"/1/0 -> boolean
//   - `accidentYear` may be a string "2019"; sometimes only `accidentDate`
//     (ISO string OR epoch ms) is present and the year must be derived
//   - text needs trimming/casing: state " il " -> "IL", lob "AUTO"/"auto" -> "Auto"
//
//  ENUM / KEY NORMALIZATION (inconsistent names AND values)
//   - line of business key is one of: `lineOfBusiness` | `line_of_business` | `lob`
//   - lob values: "auto","Auto","AUTO","personal auto","PA" -> "Auto"; etc.
//   - state may be a name ("Illinois") or abbreviation ("IL"/"il")
//
//  NORMALIZATION (de-embed repeated child documents)
//   - every doc embeds a full `carrier` object {id,name,naicCode}, OR just a
//     `carrierId` string -> lift carriers into their own {byId, allIds} table
//     and reference by id (eliminate the embedded duplication)
//
//  FLATTENING (unnest related data for easy table display)
//   - policy.holder.{firstName,lastName,state} -> holderName, state
//   - location.{city,state,zip} -> flat columns
//
//  DEDUPING
//   - some logical claims appear 2-3 times with different `version`/`updatedAt`
//     -> keep the latest version, drop the rest
//
//  HASHING (no stable id)
//   - some docs have no `_id` AND no `claimNumber` -> derive a stable synthetic
//     id by hashing a composite natural key (policyNumber + accidentYear + holder)
//
//  STRIP / WHITELIST (unknown / internal keys)
//   - stray keys like `__v`, `_debug`, `legacyCode`, `internalNotes` -> drop
//
//  VALIDATE / CLAMP (integrity problems)
//   - some `premium` values are negative              -> clamp/flag
//   - some `paid` > `incurred`                        -> flag inconsistency
//   - some `accidentYear` are in the future (e.g. 2030) -> flag/clamp
//
//  DERIVE
//   - developmentLag = reportYear - accidentYear (often not stored)
//   - incurred = paid + reserve when `loss`/incurred not provided
// ============================================================================

// --- carriers: a small pool, embedded repeatedly across claims (de-embed me) --
const CARRIERS = [
  { id: 'CAR-01', name: 'Allstate', naicCode: '19232' },
  { id: 'CAR-02', name: 'State Farm', naicCode: '25178' },
  { id: 'CAR-03', name: 'Progressive', naicCode: '24260' },
  { id: 'CAR-04', name: 'Geico', naicCode: '22063' },
  { id: 'CAR-05', name: 'Liberty Mutual', naicCode: '23043' },
]

const STATE_NAMES = {
  IL: 'Illinois',
  TX: 'Texas',
  CA: 'California',
  FL: 'Florida',
  NY: 'New York',
}
const STATE_ABBRS = Object.keys(STATE_NAMES)

const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'David', 'Aisha', 'Wei', 'Carlos']
const LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Nguyen', 'Patel', 'Brown', 'Khan', 'Lopez']

// seeded PRNG (mulberry32) so the mess is reproducible
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

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const chance = (rng, p) => rng() < p
const round2 = (n) => Math.round(n * 100) / 100

// Render a money value in one of several messy representations.
function messyMoney(rng, value) {
  const r = rng()
  if (r < 0.5) return value // plain number
  if (r < 0.7) return value.toLocaleString('en-US') // "1,234.56"
  if (r < 0.85) return '$' + value.toLocaleString('en-US') // "$1,234.56"
  return String(value) // "1234.56"
}

// Render a boolean in one of several messy representations.
function messyBool(rng, value) {
  const r = rng()
  if (r < 0.4) return value // true / false
  if (r < 0.7) return value ? 'Y' : 'N'
  if (r < 0.9) return value ? 1 : 0
  return value ? 'true' : 'false'
}

function buildRawClaim(rng, seqNum) {
  const lobCanonical = pick(rng, ['Auto', 'Homeowners', 'Commercial', 'Workers Comp'])
  const carrier = pick(rng, CARRIERS)
  const stateAbbr = pick(rng, STATE_ABBRS)

  const accidentYear = 2015 + Math.floor(rng() * 10) // 2015..2024
  const maxLag = Math.max(0, 2024 - accidentYear)
  const lag = Math.floor(rng() * (maxLag + 1))
  const reportYear = accidentYear + lag

  // underlying "true" numbers (the generator knows them; the raw doc hides/mangles them)
  const severityBase =
    lobCanonical === 'Workers Comp' ? 18000 :
    lobCanonical === 'Commercial' ? 12000 :
    lobCanonical === 'Homeowners' ? 9000 : 6000
  const incurred = round2(severityBase * (0.2 + rng() * 2.5))
  const paid = round2(incurred * Math.min(1, 0.3 + lag * 0.15 + rng() * 0.2))
  const reserve = round2(incurred - paid)
  const premium = round2(severityBase * (0.6 + rng() * 0.6))

  const firstName = pick(rng, FIRST_NAMES)
  const lastName = pick(rng, LAST_NAMES)
  const policyNumber = 'POL-' + (100000 + Math.floor(rng() * 900000))

  const doc = {}

  // --- identity: _id present ~80%, claimNumber present ~85%; sometimes neither
  if (chance(rng, 0.8)) doc._id = 'oid_' + (1000000 + seqNum).toString(16)
  if (chance(rng, 0.85)) doc.claimNumber = 'CLM-' + String(seqNum).padStart(5, '0')

  // --- carrier: embedded object most of the time, else just an id string
  if (chance(rng, 0.75)) doc.carrier = { ...carrier }
  else doc.carrierId = carrier.id

  // --- line of business: inconsistent KEY and inconsistent VALUE
  const lobValue = (() => {
    const variants = {
      Auto: ['auto', 'Auto', 'AUTO', 'personal auto', 'PA'],
      Homeowners: ['home', 'Homeowners', 'HO', 'homeowner'],
      Commercial: ['commercial', 'COMMERCIAL', 'CL', 'comm'],
      'Workers Comp': ['workers comp', 'WC', 'Workers Compensation', 'wc'],
    }
    return pick(rng, variants[lobCanonical])
  })()
  const lobKey = pick(rng, ['lineOfBusiness', 'line_of_business', 'lob'])
  doc[lobKey] = lobValue

  // --- policy: object (with nested holder) ~70%, else a bare string
  if (chance(rng, 0.7)) {
    doc.policy = {
      number: policyNumber,
      holder: {
        firstName,
        lastName,
        // holder state sometimes missing, sometimes name, sometimes messy abbr
        ...(chance(rng, 0.85)
          ? { state: chance(rng, 0.5) ? STATE_NAMES[stateAbbr] : ' ' + stateAbbr.toLowerCase() + ' ' }
          : {}),
      },
    }
  } else {
    doc.policy = policyNumber // polymorphic: just the number as a string
  }

  // --- location: nested, sometimes present (flatten target)
  if (chance(rng, 0.6)) {
    doc.location = {
      city: 'City' + Math.floor(rng() * 50),
      state: stateAbbr,
      zip: String(10000 + Math.floor(rng() * 89999)),
    }
  }

  // --- accident year: string|number, or only a date to derive from
  if (chance(rng, 0.5)) {
    doc.accidentYear = chance(rng, 0.5) ? accidentYear : String(accidentYear)
  } else {
    // provide a date instead (ISO string or epoch ms) -> derive year
    const month = 1 + Math.floor(rng() * 12)
    if (chance(rng, 0.5)) {
      doc.accidentDate = `${accidentYear}-${String(month).padStart(2, '0')}-15`
    } else {
      // epoch ms for Jan 1 of that year + offset (deterministic, no Date.now)
      const epoch = (accidentYear - 1970) * 31557600000
      doc.accidentDate = epoch
    }
  }
  // report year sometimes present, sometimes not (derive lag from it when here)
  if (chance(rng, 0.6)) doc.reportYear = chance(rng, 0.5) ? reportYear : String(reportYear)

  // --- premium: messy money, sometimes cents-integer, sometimes negative, sometimes null
  if (chance(rng, 0.1)) {
    doc.premium = null
  } else if (chance(rng, 0.15)) {
    doc.premiumCents = Math.round(premium * 100) // unit normalization needed
  } else if (chance(rng, 0.08)) {
    doc.premium = messyMoney(rng, -premium) // integrity: negative
  } else {
    doc.premium = messyMoney(rng, premium)
  }
  if (chance(rng, 0.5)) doc.currency = 'USD' // else missing -> default USD

  // --- loss: polymorphic. object {paid,reserve} | number(incurred) | via payments[]
  const lossMode = rng()
  if (lossMode < 0.4) {
    // object form; reserve sometimes missing/null -> default 0
    doc.loss = { paid: messyMoney(rng, paid) }
    if (chance(rng, 0.7)) doc.loss.reserve = chance(rng, 0.85) ? messyMoney(rng, reserve) : null
  } else if (lossMode < 0.7) {
    // single incurred number/string
    doc.incurredLoss = messyMoney(rng, incurred)
  } else {
    // payments: array OR single number -> sum for paid; reserve separate (maybe absent)
    if (chance(rng, 0.6)) {
      const n = 1 + Math.floor(rng() * 3)
      const parts = []
      let remaining = paid
      for (let k = 0; k < n; k++) {
        const part = k === n - 1 ? remaining : round2(remaining * rng())
        remaining = round2(remaining - part)
        parts.push(chance(rng, 0.5) ? part : messyMoney(rng, part))
      }
      doc.payments = parts
    } else {
      doc.payments = messyMoney(rng, paid) // single value, not an array
    }
    if (chance(rng, 0.5)) doc.reserve = messyMoney(rng, reserve)
  }

  // sometimes an explicit top-level reserve (number/null) regardless of above
  if (doc.reserve === undefined && chance(rng, 0.3)) {
    doc.reserve = chance(rng, 0.8) ? messyMoney(rng, reserve) : null
  }

  // integrity: occasionally make paid exceed incurred via an inflated extra payment
  if (chance(rng, 0.05)) doc.paidOverride = messyMoney(rng, round2(incurred * 1.5))

  // --- status: explicit | missing (default Open) | implied by closedDate presence
  const statusRoll = rng()
  const isClosed = statusRoll < 0.4
  const isReopened = statusRoll >= 0.4 && statusRoll < 0.55
  if (chance(rng, 0.7)) {
    const status = isClosed ? 'Closed' : isReopened ? 'Reopened' : 'Open'
    doc.status = pick(rng, [status, status.toUpperCase(), status.toLowerCase()])
  } // else: status missing entirely -> default Open (unless closedDate present)
  if (isClosed || isReopened) {
    // closedDate present implies the claim is closed/reopened
    doc.closedDate = `${reportYear}-0${1 + Math.floor(rng() * 8)}-10`
  }
  if (isReopened) doc.reopened = messyBool(rng, true)
  else if (chance(rng, 0.3)) doc.reopened = messyBool(rng, false) // else absent -> false

  // --- PII to hash (claimant). Sometimes present, sometimes not.
  if (chance(rng, 0.7)) doc.claimantSSN = '###-##-' + String(1000 + Math.floor(rng() * 9000))

  // --- stray internal keys to strip
  if (chance(rng, 0.5)) doc.__v = Math.floor(rng() * 5)
  if (chance(rng, 0.2)) doc._debug = { ingestedBy: 'legacy-etl' }
  if (chance(rng, 0.2)) doc.legacyCode = 'L' + Math.floor(rng() * 999)
  if (chance(rng, 0.15)) doc.internalNotes = 'do not display'

  // versioning for dedupe (updatedAt as deterministic incrementing string)
  doc.version = 1
  doc.updatedAt = `${reportYear}-01-01T00:00:00Z`

  // keep the "truth" hidden helpers OFF the doc; expose only natural key bits
  // (these are real fields, just used later by dedupe/hash exercises)
  return doc
}

/**
 * Generate jagged raw claim documents.
 * @param {number} count base number of logical claims (default 250)
 * @param {number} seed  PRNG seed (default 7)
 * @returns {object[]} raw, messy documents (with duplicates mixed in)
 */
export function generateRawClaims(count = 250, seed = 7) {
  const rng = makeRng(seed)
  const docs = []

  for (let i = 1; i <= count; i++) {
    const doc = buildRawClaim(rng, i)
    docs.push(doc)

    // DEDUPE scenario: ~8% of claims get one or two extra versions with newer
    // updatedAt and slightly different numbers. Same identity, must keep latest.
    if (chance(rng, 0.08) && (doc._id || doc.claimNumber)) {
      const copies = 1 + Math.floor(rng() * 2)
      for (let v = 0; v < copies; v++) {
        const dup = JSON.parse(JSON.stringify(doc))
        dup.version = doc.version + v + 1
        dup.updatedAt = `${2024}-0${1 + v}-01T00:00:00Z`
        // mutate a value so "latest wins" actually matters
        if (dup.reserve !== undefined) dup.reserve = messyMoney(rng, round2(rng() * 5000))
        docs.push(dup)
      }
    }
  }

  // shuffle deterministically so duplicates aren't always adjacent
  for (let i = docs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[docs[i], docs[j]] = [docs[j], docs[i]]
  }

  return docs
}
