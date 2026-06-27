
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