
//coercion helpers


const toNumber = (value) => {

    if(value === undefined) return null;
    if(typeof value === "number") return value;

    if (typeof value === "string") {
        let result = '';
        let hasDecimal = false;
        let hasMinus = false;

        for (const ch of value) {
            if (ch >= '0' && ch <= '9') {
                result += ch;
                continue;
            }

            if (ch === '.' && !hasDecimal) {
                result += ch;
                hasDecimal = true;
                continue;
            }

            if (ch === '-' && result.length === 0 && !hasMinus) {
                result += ch;
                hasMinus = true;
                continue;
            }
        }
        return Number(result);
    }

  return null;

}

const toBool = (value) => {

    let bValue = value;
    if(typeof bValue === 'boolean') return value;
    if(typeof bValue === 'string') bValue = value.trim().toLowerCase();

    switch (bValue) {
        case "y": return true;
        case "n": return false;
        case 0: return false;
        case 1: return true;
        case "false": return false;
        case "true": return true;
        default: return false;

    }
}

// toYear: return a 4-digit year number from the many ways a year can arrive.
// The trick is disambiguation — telling a year from an epoch from a date string.
const toYear = (value) => {
    // Already a number. A real calendar year is at most 4 digits (<= 9999);
    // anything larger must be an epoch timestamp in milliseconds, so convert it.
    // (getUTCFullYear avoids timezone shifting a Jan-1 date into the prior year.)
    if (typeof value === 'number') {
        if (value > 9999) return new Date(value).getUTCFullYear();
        return value;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        // A date string has a '-' separator, e.g. "2020-09-15". Let Date parse it
        // and pull the year; guard against an unparseable string -> NaN -> null.
        if (trimmed.includes('-')) {
            const year = new Date(trimmed).getUTCFullYear();
            return Number.isNaN(year) ? null : year;
        }

        // Otherwise it's a plain numeric string like "2019" (or a stringified
        // epoch). Convert to a number and reuse the number branch above.
        return toYear(Number(trimmed));
    }

    // null, undefined, objects, anything we can't interpret.
    return null;
}

const getPolicyNumber = (raw) => (
    typeof raw.policy === 'string' ? raw.policy : 
        (raw.policy?.number ?? null)
);

const getHolderName = (raw) => {
    const first = raw.policy?.holder?.firstName;
    const last = raw.policy?.holder?.lastName;

    return [first, last].filter(Boolean).join(' ') || null;
}

const getAccidentYear = (raw) => toYear(raw.accidentYear) 
    ?? toYear(raw.accidentDate);

const getReportYear = (raw) => toYear(raw.reportYear) 
    ?? toYear(raw.reportData);


const LOB_MAP = {
  'auto': 'Auto', 'personal auto': 'Auto', 'pa': 'Auto',
  'home': 'Homeowners', 'homeowner': 'Homeowners', 'homeowners': 'Homeowners', 'ho': 'Homeowners',
  'commercial': 'Commercial', 'comm': 'Commercial', 'cl': 'Commercial',
  'workers comp': 'Workers Comp', 'workers compensation': 'Workers Comp', 'wc': 'Workers Comp',
}

const getLineOfBusiness = (raw) => {
    const lob = (raw.lineOfBusiness ?? raw.line_of_business ?? raw.lob)?.trim().toLowerCase();
    return LOB_MAP[lob] ?? null;

}

const STATE_MAP = { illinois: 'IL', texas: 'TX', california: 'CA', florida: 'FL', 'new york': 'NY' };

const getState = (raw) => {
    const state = (raw.policy?.holder?.state ?? raw.location?.state);
    if(!state) return null;
    return STATE_MAP[state.trim().toLowerCase()] ?? state.trim().toUpperCase();
}

const STATUS_MAP = { open: 'Open', closed: 'Closed', reopened: 'Reopened'};

const getStatus = (raw) => {
    if(raw.status?.trim() === 'Open' || STATUS_MAP[raw.status?.trim().toLowerCase()] === "Open") return "Open";
    if(raw.status === 'Reopened' || STATUS_MAP[raw.status?.trim().toLowerCase()] === 'Reopened' || toBool(raw.reopened)) return "Reopened";
    if(raw.status === 'Closed' || STATUS_MAP[raw.status?.trim().toLowerCase()] === 'Closed' || raw.closedDate) return "Closed";
    

    return "Open";
}

const getCarrierId = (raw) => {
    return raw.carrier?.id ?? raw.carrierId ?? null;
}

const getPremium = (raw) => {
    if(raw.premiumCents) return toNumber(raw.premiumCents)/100;
    return toNumber(raw.premium);
}

const sum = (arr) => arr.reduce((acc, n) => acc + toNumber(n), 0);

const getPaidLoss = (raw) => {
    
    if(raw.loss?.paid) return toNumber(raw.loss?.paid);
    if(raw.payments && Array.isArray(raw.payments)) return sum(raw.payments);
    if(raw.payments) return toNumber(raw.payments);
    return null;
}

const getReserve = (raw) => {
    if(raw.reserve) return toNumber(raw.reserve);
    if(raw.loss?.reserve) return toNumber(raw.loss?.reserve);
    return 0;
}

const getIncurred = (raw) => {
    const paid = getPaidLoss(raw);
    const reserve = getReserve(raw);
    return toNumber(raw.incurredLoss) ?? (paid ?? 0) + (reserve);
}


export const normalizeClaim = (raw) => {
    const accidentYear = getAccidentYear(raw);
    const reportYear = getReportYear(raw);

    return {
        id: raw._id ?? raw.claimNumber ?? null,
        policyNumber: getPolicyNumber(raw),
        holderName: getHolderName(raw),
        carrierId: getCarrierId(raw),
        lineOfBusiness: getLineOfBusiness(raw),
        state: getState(raw),
        accidentYear,
        reportYear,
        developmentLag: accidentYear !== null && reportYear !== null ? reportYear - accidentYear : null,
        earnedPremium: getPremium(raw),
        paidLoss: getPaidLoss(raw),
        reserve: getReserve(raw),
        incurredLoss: getIncurred(raw),
        claimStatus: getStatus(raw),
        reopened: toBool(raw.reopened),
        version: raw.version ?? 0,
    }
}

export const dedupeClaims = (claims) => {
    const byId = new Map();

    for(const c of claims){
        const existing = byId.get(c.id);
        if(!existing || c.version > existing.version) {
            byId.set(c.id, c);
        }
    }

    return [...byId].map(([id, claim]) => claim);
}













