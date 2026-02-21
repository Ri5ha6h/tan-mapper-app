/**
 * Groovy Shim Library
 *
 * Runtime equivalents for Groovy/Java standard library APIs referenced in
 * transpiled code. These shims are injected into the generated script's scope
 * when executing transpiled Groovy code.
 *
 * The transpiler (groovy-transpiler.ts) emits calls to these functions:
 *   - createDateFormatter(pattern) — SimpleDateFormat
 *   - roundTo(value, places) — BigDecimal / .round()
 *   - chunkArray(arr, size) — .collate()
 *   - getText(node) — XML .text()
 *   - deepFindAll(root, predicate) — .'**'.findAll
 *   - getISOCountries() — Locale.getISOCountries()
 *   - stringFormat(fmt, ...args) — String.format()
 *   - jtShims.* — Platform API stubs (JTUtil, JTLookupUtil, JTV3Utils)
 */

// ============================================================
// 7.2 — Date Formatting Shims
// ============================================================

/**
 * Java SimpleDateFormat pattern tokens → JS formatting logic.
 * Handles the common patterns found in legacy files:
 *   "yyyy-MM-dd HH:mm:ss"
 *   "yyyy-MM-dd'T'HH:mm:ss"
 *   "MM/dd/yyyy"
 *   "yyyyMMddHHmmss"
 *   "EEE MMM dd HH:mm:ss zzz yyyy"
 */
interface DateFormatter {
    format(date: Date): string
    parse(dateStr: string): Date
}

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_NAMES_LONG = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]
const MONTH_NAMES_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]
const MONTH_NAMES_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

/**
 * Tokenizes a Java SimpleDateFormat pattern into an array of tokens.
 * Handles quoted literals ('T', 'text'), repeated pattern letters, and literal chars.
 */
function tokenizePattern(pattern: string): string[] {
    const tokens: string[] = []
    let i = 0
    while (i < pattern.length) {
        const ch = pattern[i]
        if (ch === "'") {
            // Quoted literal
            let literal = ""
            i++ // skip opening quote
            while (i < pattern.length && pattern[i] !== "'") {
                literal += pattern[i]
                i++
            }
            i++ // skip closing quote
            tokens.push(`'${literal}'`)
        } else if (/[a-zA-Z]/.test(ch)) {
            // Pattern letter — consume all repeated occurrences
            let token = ch
            i++
            while (i < pattern.length && pattern[i] === ch) {
                token += ch
                i++
            }
            tokens.push(token)
        } else {
            // Literal character (-, /, :, space, etc.)
            tokens.push(ch)
            i++
        }
    }
    return tokens
}

function pad(n: number, width: number): string {
    return String(n).padStart(width, "0")
}

function formatToken(token: string, date: Date): string {
    // Quoted literal
    if (token.startsWith("'")) {
        return token.slice(1, -1)
    }

    switch (token) {
        // Year
        case "yyyy":
            return pad(date.getFullYear(), 4)
        case "yy":
            return pad(date.getFullYear() % 100, 2)

        // Month
        case "MM":
            return pad(date.getMonth() + 1, 2)
        case "M":
            return String(date.getMonth() + 1)
        case "MMM":
            return MONTH_NAMES_SHORT[date.getMonth()]
        case "MMMM":
            return MONTH_NAMES_LONG[date.getMonth()]

        // Day
        case "dd":
            return pad(date.getDate(), 2)
        case "d":
            return String(date.getDate())

        // Day of week
        case "EEE":
            return DAY_NAMES_SHORT[date.getDay()]
        case "EEEE":
            return DAY_NAMES_LONG[date.getDay()]

        // Hour (24h)
        case "HH":
            return pad(date.getHours(), 2)
        case "H":
            return String(date.getHours())

        // Hour (12h)
        case "hh":
            return pad(date.getHours() % 12 || 12, 2)
        case "h":
            return String(date.getHours() % 12 || 12)

        // Minutes
        case "mm":
            return pad(date.getMinutes(), 2)
        case "m":
            return String(date.getMinutes())

        // Seconds
        case "ss":
            return pad(date.getSeconds(), 2)
        case "s":
            return String(date.getSeconds())

        // Milliseconds
        case "SSS":
            return pad(date.getMilliseconds(), 3)
        case "SS":
            return pad(Math.floor(date.getMilliseconds() / 10), 2)
        case "S":
            return String(Math.floor(date.getMilliseconds() / 100))

        // AM/PM
        case "a":
            return date.getHours() < 12 ? "AM" : "PM"

        // Timezone
        case "z":
        case "zz":
        case "zzz":
        case "zzzz": {
            try {
                return (
                    Intl.DateTimeFormat("en", { timeZoneName: "short" })
                        .formatToParts(date)
                        .find((p) => p.type === "timeZoneName")?.value ?? "UTC"
                )
            } catch {
                return "UTC"
            }
        }

        case "Z": {
            const offset = -date.getTimezoneOffset()
            const sign = offset >= 0 ? "+" : "-"
            const h = pad(Math.floor(Math.abs(offset) / 60), 2)
            const m = pad(Math.abs(offset) % 60, 2)
            return `${sign}${h}${m}`
        }

        case "X":
        case "XX":
        case "XXX": {
            const offset = -date.getTimezoneOffset()
            if (offset === 0) return "Z"
            const sign = offset >= 0 ? "+" : "-"
            const h = pad(Math.floor(Math.abs(offset) / 60), 2)
            const m = pad(Math.abs(offset) % 60, 2)
            return token === "X"
                ? `${sign}${h}`
                : token === "XX"
                  ? `${sign}${h}${m}`
                  : `${sign}${h}:${m}`
        }

        default:
            // Unrecognized — return as literal
            return token
    }
}

/**
 * Build a regex pattern for parsing based on the Java pattern tokens.
 * Returns { regex, groupMapping } for extracting date components.
 */
interface ParseGroup {
    token: string
    index: number
}

function buildParseRegex(tokens: string[]): { regex: RegExp; groups: ParseGroup[] } {
    let regexStr = "^"
    const groups: ParseGroup[] = []
    let groupIdx = 1

    for (const token of tokens) {
        if (token.startsWith("'")) {
            // Literal — escape for regex
            regexStr += escapeRegex(token.slice(1, -1))
        } else if (/^[a-zA-Z]+$/.test(token)) {
            switch (token) {
                case "yyyy":
                    regexStr += "(\\d{4})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "yy":
                    regexStr += "(\\d{2})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "MM":
                case "dd":
                case "HH":
                case "hh":
                case "mm":
                case "ss":
                    regexStr += "(\\d{2})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "M":
                case "d":
                case "H":
                case "h":
                case "m":
                case "s":
                    regexStr += "(\\d{1,2})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "SSS":
                    regexStr += "(\\d{3})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "SS":
                    regexStr += "(\\d{2})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "S":
                    regexStr += "(\\d{1})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "EEE":
                    regexStr += "(\\w{3})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "EEEE":
                    regexStr += "(\\w+)"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "MMM":
                    regexStr += "(\\w{3})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "MMMM":
                    regexStr += "(\\w+)"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "a":
                    regexStr += "(AM|PM)"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "z":
                case "zz":
                case "zzz":
                case "zzzz":
                    regexStr += "([A-Za-z/_ ]+?)"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "Z":
                    regexStr += "([+-]\\d{4})"
                    groups.push({ token, index: groupIdx++ })
                    break
                case "X":
                case "XX":
                case "XXX":
                    regexStr += "(Z|[+-]\\d{2}(?::?\\d{2})?)"
                    groups.push({ token, index: groupIdx++ })
                    break
                default:
                    // Unknown pattern letter — match as-is
                    regexStr += escapeRegex(token)
            }
        } else {
            // Literal character
            regexStr += escapeRegex(token)
        }
    }

    regexStr += "$"
    return { regex: new RegExp(regexStr), groups }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function createDateFormatter(pattern: string): DateFormatter {
    const tokens = tokenizePattern(pattern)
    const { regex, groups } = buildParseRegex(tokens)

    return {
        format(date: Date): string {
            return tokens.map((t) => formatToken(t, date)).join("")
        },

        parse(dateStr: string): Date {
            // Try pattern-based parsing first
            const match = regex.exec(dateStr)
            if (match) {
                let year = 1970
                let month = 0
                let day = 1
                let hours = 0
                let minutes = 0
                let seconds = 0
                let ms = 0
                let isPM = false

                for (const g of groups) {
                    const val = match[g.index]
                    switch (g.token) {
                        case "yyyy":
                            year = parseInt(val, 10)
                            break
                        case "yy":
                            year = 2000 + parseInt(val, 10)
                            break
                        case "MM":
                        case "M":
                            month = parseInt(val, 10) - 1
                            break
                        case "MMM":
                            month = MONTH_NAMES_SHORT.indexOf(val)
                            break
                        case "MMMM":
                            month = MONTH_NAMES_LONG.indexOf(val)
                            break
                        case "dd":
                        case "d":
                            day = parseInt(val, 10)
                            break
                        case "HH":
                        case "H":
                            hours = parseInt(val, 10)
                            break
                        case "hh":
                        case "h":
                            hours = parseInt(val, 10)
                            break
                        case "mm":
                        case "m":
                            minutes = parseInt(val, 10)
                            break
                        case "ss":
                        case "s":
                            seconds = parseInt(val, 10)
                            break
                        case "SSS":
                            ms = parseInt(val, 10)
                            break
                        case "SS":
                            ms = parseInt(val, 10) * 10
                            break
                        case "S":
                            ms = parseInt(val, 10) * 100
                            break
                        case "a":
                            isPM = val === "PM"
                            break
                        // EEE/EEEE, z/Z/X are informational — don't affect Date construction
                    }
                }

                if (isPM && hours < 12) hours += 12
                if (!isPM && hours === 12 && groups.some((g) => g.token === "a")) hours = 0

                return new Date(year, month, day, hours, minutes, seconds, ms)
            }

            // Fallback to native parser
            const d = new Date(dateStr)
            if (isNaN(d.getTime())) {
                throw new Error(`Cannot parse date: "${dateStr}" with pattern "${pattern}"`)
            }
            return d
        },
    }
}

/**
 * Parse an ISO-8601 / RFC date string, optionally with a pattern hint.
 * Replaces ZonedDateTime.parse().
 */
export function parseZonedDateTime(dateStr: string, _pattern?: string): Date {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) {
        throw new Error(`Cannot parse date: "${dateStr}"`)
    }
    return d
}

/** LocalDate.now() replacement — returns a Date at midnight local time */
export function nowLocalDate(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** ZonedDateTime.now(timezone?) replacement */
export function nowZonedDateTime(timezone?: string): Date {
    if (!timezone) return new Date()
    // Use Intl to get the date in the target timezone, then construct
    const str = new Date().toLocaleString("en-US", { timeZone: timezone })
    return new Date(str)
}

/** Instant.ofEpochSecond(epoch) replacement */
export function fromEpochSecond(epoch: number): Date {
    return new Date(epoch * 1000)
}

// ============================================================
// 7.3 — Numeric Shims
// ============================================================

/** Groovy .round(n) and BigDecimal.setScale() replacement */
export function roundTo(value: number | string, places: number): number {
    const num = typeof value === "string" ? parseFloat(value) : value
    if (isNaN(num)) return 0
    const factor = Math.pow(10, places)
    return Math.round(num * factor) / factor
}

type RoundingMode = "HALF_UP" | "HALF_DOWN" | "FLOOR" | "CEILING" | "UP" | "DOWN"

interface BigDecimalLike {
    value: number
    setScale(places: number, roundingMode?: RoundingMode): BigDecimalLike
    add(other: BigDecimalLike | number): BigDecimalLike
    subtract(other: BigDecimalLike | number): BigDecimalLike
    multiply(other: BigDecimalLike | number): BigDecimalLike
    divide(
        other: BigDecimalLike | number,
        scale?: number,
        roundingMode?: RoundingMode,
    ): BigDecimalLike
    compareTo(other: BigDecimalLike | number): number
    toString(): string
    toNumber(): number
}

function toNumber(v: BigDecimalLike | number): number {
    return typeof v === "number" ? v : v.value
}

/** BigDecimal approximation using native floats */
export function bigDecimal(value: number | string): BigDecimalLike {
    const num = typeof value === "string" ? parseFloat(value) : value

    const self: BigDecimalLike = {
        value: num,

        setScale(places: number, _roundingMode?: RoundingMode): BigDecimalLike {
            return bigDecimal(roundTo(num, places))
        },

        add(other: BigDecimalLike | number): BigDecimalLike {
            return bigDecimal(num + toNumber(other))
        },

        subtract(other: BigDecimalLike | number): BigDecimalLike {
            return bigDecimal(num - toNumber(other))
        },

        multiply(other: BigDecimalLike | number): BigDecimalLike {
            return bigDecimal(num * toNumber(other))
        },

        divide(
            other: BigDecimalLike | number,
            scale?: number,
            _roundingMode?: RoundingMode,
        ): BigDecimalLike {
            const divisor = toNumber(other)
            if (divisor === 0) throw new Error("Division by zero")
            const result = num / divisor
            return scale != null ? bigDecimal(roundTo(result, scale)) : bigDecimal(result)
        },

        compareTo(other: BigDecimalLike | number): number {
            const otherNum = toNumber(other)
            if (num < otherNum) return -1
            if (num > otherNum) return 1
            return 0
        },

        toString(): string {
            return String(num)
        },

        toNumber(): number {
            return num
        },
    }

    return self
}

// ============================================================
// 7.4 — Collection Shims
// ============================================================

/** Groovy .collate(n) → splits array into chunks of size n */
export function chunkArray<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr]
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }
    return chunks
}

/** Groovy .sum() — sums an array of numbers (or extracts via closure) */
export function sum(arr: unknown[], fn?: (item: unknown) => number): number {
    if (fn) {
        return arr.reduce<number>((acc, item) => acc + fn(item), 0)
    }
    return arr.reduce<number>((acc, item) => acc + Number(item), 0)
}

/**
 * Groovy .findResult() — returns the first non-null result of applying fn to each element.
 */
export function findResult<T, R>(arr: T[], fn: (item: T) => R | null | undefined): R | null {
    for (const item of arr) {
        const result = fn(item)
        if (result != null) return result
    }
    return null
}

// ============================================================
// 7.5 — Locale / Country Code Shims
// ============================================================

/**
 * ISO 3166-1 alpha-2 to alpha-3 country code mapping.
 * Complete list of 249 officially assigned codes.
 */
const ISO_COUNTRIES: Record<string, string> = {
    AF: "AFG",
    AX: "ALA",
    AL: "ALB",
    DZ: "DZA",
    AS: "ASM",
    AD: "AND",
    AO: "AGO",
    AG: "ATG",
    AR: "ARG",
    AM: "ARM",
    AW: "ABW",
    AU: "AUS",
    AT: "AUT",
    AZ: "AZE",
    BS: "BHS",
    BH: "BHR",
    BD: "BGD",
    BB: "BRB",
    BY: "BLR",
    BE: "BEL",
    BZ: "BLZ",
    BJ: "BEN",
    BM: "BMU",
    BT: "BTN",
    BO: "BOL",
    BQ: "BES",
    BA: "BIH",
    BW: "BWA",
    BV: "BVT",
    BR: "BRA",
    IO: "IOT",
    BN: "BRN",
    BG: "BGR",
    BF: "BFA",
    BI: "BDI",
    CV: "CPV",
    KH: "KHM",
    CM: "CMR",
    CA: "CAN",
    KY: "CYM",
    CF: "CAF",
    TD: "TCD",
    CL: "CHL",
    CN: "CHN",
    CX: "CXR",
    CC: "CCK",
    CO: "COL",
    KM: "COM",
    CG: "COG",
    CD: "COD",
    CK: "COK",
    CR: "CRI",
    CI: "CIV",
    HR: "HRV",
    CU: "CUB",
    CW: "CUW",
    CY: "CYP",
    CZ: "CZE",
    DK: "DNK",
    DJ: "DJI",
    DM: "DMA",
    DO: "DOM",
    EC: "ECU",
    EG: "EGY",
    SV: "SLV",
    GQ: "GNQ",
    ER: "ERI",
    EE: "EST",
    SZ: "SWZ",
    ET: "ETH",
    FK: "FLK",
    FO: "FRO",
    FJ: "FJI",
    FI: "FIN",
    FR: "FRA",
    GF: "GUF",
    PF: "PYF",
    TF: "ATF",
    GA: "GAB",
    GM: "GMB",
    GE: "GEO",
    DE: "DEU",
    GH: "GHA",
    GI: "GIB",
    GR: "GRC",
    GL: "GRL",
    GD: "GRD",
    GP: "GLP",
    GU: "GUM",
    GT: "GTM",
    GG: "GGY",
    GN: "GIN",
    GW: "GNB",
    GY: "GUY",
    HT: "HTI",
    HM: "HMD",
    VA: "VAT",
    HN: "HND",
    HK: "HKG",
    HU: "HUN",
    IS: "ISL",
    IN: "IND",
    ID: "IDN",
    IR: "IRN",
    IQ: "IRQ",
    IE: "IRL",
    IM: "IMN",
    IL: "ISR",
    IT: "ITA",
    JM: "JAM",
    JP: "JPN",
    JE: "JEY",
    JO: "JOR",
    KZ: "KAZ",
    KE: "KEN",
    KI: "KIR",
    KP: "PRK",
    KR: "KOR",
    KW: "KWT",
    KG: "KGZ",
    LA: "LAO",
    LV: "LVA",
    LB: "LBN",
    LS: "LSO",
    LR: "LBR",
    LY: "LBY",
    LI: "LIE",
    LT: "LTU",
    LU: "LUX",
    MO: "MAC",
    MG: "MDG",
    MW: "MWI",
    MY: "MYS",
    MV: "MDV",
    ML: "MLI",
    MT: "MLT",
    MH: "MHL",
    MQ: "MTQ",
    MR: "MRT",
    MU: "MUS",
    YT: "MYT",
    MX: "MEX",
    FM: "FSM",
    MD: "MDA",
    MC: "MCO",
    MN: "MNG",
    ME: "MNE",
    MS: "MSR",
    MA: "MAR",
    MZ: "MOZ",
    MM: "MMR",
    NA: "NAM",
    NR: "NRU",
    NP: "NPL",
    NL: "NLD",
    NC: "NCL",
    NZ: "NZL",
    NI: "NIC",
    NE: "NER",
    NG: "NGA",
    NU: "NIU",
    NF: "NFK",
    MK: "MKD",
    MP: "MNP",
    NO: "NOR",
    OM: "OMN",
    PK: "PAK",
    PW: "PLW",
    PS: "PSE",
    PA: "PAN",
    PG: "PNG",
    PY: "PRY",
    PE: "PER",
    PH: "PHL",
    PN: "PCN",
    PL: "POL",
    PT: "PRT",
    PR: "PRI",
    QA: "QAT",
    RE: "REU",
    RO: "ROU",
    RU: "RUS",
    RW: "RWA",
    BL: "BLM",
    SH: "SHN",
    KN: "KNA",
    LC: "LCA",
    MF: "MAF",
    PM: "SPM",
    VC: "VCT",
    WS: "WSM",
    SM: "SMR",
    ST: "STP",
    SA: "SAU",
    SN: "SEN",
    RS: "SRB",
    SC: "SYC",
    SL: "SLE",
    SG: "SGP",
    SX: "SXM",
    SK: "SVK",
    SI: "SVN",
    SB: "SLB",
    SO: "SOM",
    ZA: "ZAF",
    GS: "SGS",
    SS: "SSD",
    ES: "ESP",
    LK: "LKA",
    SD: "SDN",
    SR: "SUR",
    SJ: "SJM",
    SE: "SWE",
    CH: "CHE",
    SY: "SYR",
    TW: "TWN",
    TJ: "TJK",
    TZ: "TZA",
    TH: "THA",
    TL: "TLS",
    TG: "TGO",
    TK: "TKL",
    TO: "TON",
    TT: "TTO",
    TN: "TUN",
    TR: "TUR",
    TM: "TKM",
    TC: "TCA",
    TV: "TUV",
    UG: "UGA",
    UA: "UKR",
    AE: "ARE",
    GB: "GBR",
    US: "USA",
    UM: "UMI",
    UY: "URY",
    UZ: "UZB",
    VU: "VUT",
    VE: "VEN",
    VN: "VNM",
    VG: "VGB",
    VI: "VIR",
    WF: "WLF",
    EH: "ESH",
    YE: "YEM",
    ZM: "ZMB",
    ZW: "ZWE",
    AI: "AIA",
}

/** Locale.getISOCountries() — returns array of ISO 3166-1 alpha-2 codes */
export function getISOCountries(): string[] {
    return Object.keys(ISO_COUNTRIES)
}

/** Maps alpha-2 to alpha-3 country code */
export function getISO3Country(alpha2Code: string): string {
    const code = alpha2Code.toUpperCase()
    return ISO_COUNTRIES[code] ?? code
}

/** Creates a locale object with .getISO3Country() */
export function createLocale(language: string, country: string) {
    return {
        language,
        country,
        getISO3Country(): string {
            return getISO3Country(country)
        },
        toString(): string {
            return country ? `${language}_${country}` : language
        },
    }
}

// ============================================================
// 7.6 — XML GPath Shims
// ============================================================

/**
 * Extracts text content from a parsed XML node.
 * Works with fast-xml-parser output structure where:
 *   - text is stored in '#text' property
 *   - or the value itself is a string/number
 */
export function getText(node: unknown): string {
    if (node == null) return ""
    if (typeof node === "string") return node
    if (typeof node === "number" || typeof node === "boolean") return String(node)

    if (Array.isArray(node)) {
        return node.map(getText).join("")
    }

    if (typeof node === "object") {
        const obj = node as Record<string, unknown>
        // fast-xml-parser stores text in '#text'
        if ("#text" in obj) return String(obj["#text"] ?? "")

        // Collect all text content from children
        let text = ""
        for (const key of Object.keys(obj)) {
            if (!key.startsWith("@_") && !key.startsWith(":@")) {
                text += getText(obj[key])
            }
        }
        return text
    }

    return String(node)
}

/**
 * Recursively walks all descendant nodes and returns those matching the predicate.
 * Implements Groovy's source.'**'.findAll { predicate }
 */
export function deepFindAll(root: unknown, predicate: (node: unknown) => boolean): unknown[] {
    const results: unknown[] = []

    function walk(node: unknown): void {
        if (node == null) return

        if (predicate(node)) {
            results.push(node)
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                walk(item)
            }
        } else if (typeof node === "object") {
            const obj = node as Record<string, unknown>
            for (const key of Object.keys(obj)) {
                walk(obj[key])
            }
        }
    }

    walk(root)
    return results
}

/**
 * Proxy-based wrapper for dot-notation XML traversal.
 * Allows Groovy-like GPath access on parsed XML:
 *   proxy.Element.Child → navigates tree
 *   proxy['@attrName'] → attribute value
 *   proxy.text() → text content
 *   proxy.name() → element name
 */
export function xmlProxy(node: unknown): unknown {
    if (node == null || typeof node !== "object") return node

    return new Proxy(node as Record<string, unknown>, {
        get(target, prop: string | symbol) {
            if (typeof prop === "symbol") return (target as Record<symbol, unknown>)[prop]

            // .text() method
            if (prop === "text") return () => getText(target)

            // .name() method — returns the first non-attribute key
            if (prop === "name") {
                return () => {
                    for (const key of Object.keys(target)) {
                        if (!key.startsWith("@_") && !key.startsWith(":@") && key !== "#text") {
                            return key
                        }
                    }
                    return ""
                }
            }

            // .'**' — deep traversal entry point
            if (prop === "**") {
                return {
                    findAll: (fn: (node: unknown) => boolean) =>
                        deepFindAll(target, fn).map(xmlProxy),
                }
            }

            // @attr access (Groovy uses .@attr, transpiler may emit ['@attr'])
            if (prop.startsWith("@")) {
                return target[prop] ?? target[`@_${prop.slice(1)}`]
            }

            const value = target[prop]
            if (value == null) return undefined

            if (Array.isArray(value)) return value.map(xmlProxy)
            if (typeof value === "object") return xmlProxy(value)
            return value
        },
    })
}

// ============================================================
// 7.7 — Platform API Stubs
// ============================================================

/** JTUtil stub — platform data/logging API */
const JTUtil = {
    getGlobalData: (...args: unknown[]) => {
        console.warn("[JTUtil.getGlobalData] Platform API not available — returning null", args)
        return null
    },
    logFailureEvent: (...args: unknown[]) => {
        console.error("[JTUtil.logFailureEvent]", ...args)
    },
}

/** JTLookupUtil stub — lookup table API */
const JTLookupUtil = {
    getLookupTable: (...args: unknown[]) => {
        console.warn(
            "[JTLookupUtil.getLookupTable] Platform API not available — returning {}",
            args,
        )
        return {}
    },
    getLookupTableValue: (...args: unknown[]) => {
        console.warn(
            "[JTLookupUtil.getLookupTableValue] Platform API not available — returning null",
            args,
        )
        return null
    },
}

/** JTJSONObject stub — thin wrapper around plain JS object */
class JTJSONObject {
    private data: Record<string, unknown>

    constructor(initial?: string | Record<string, unknown>) {
        if (typeof initial === "string") {
            this.data = JSON.parse(initial) as Record<string, unknown>
        } else {
            this.data = initial ?? {}
        }
    }

    put(key: string, value: unknown): void {
        this.data[key] = value
    }

    get(key: string): unknown {
        return this.data[key] ?? null
    }

    toString(): string {
        return JSON.stringify(this.data)
    }

    toJSON(): Record<string, unknown> {
        return this.data
    }
}

/** JsonSlurper stub */
const JsonSlurper = {
    parseText: (s: string) => JSON.parse(s),
}

/**
 * Combined platform API stubs object.
 * The transpiler emits calls like `jtShims.getGlobalData(...)`.
 * This is a Proxy that handles any method call with a warning.
 */
const jtShimsBase: Record<string, (...args: unknown[]) => unknown> = {
    // JTUtil methods
    getGlobalData: JTUtil.getGlobalData,
    logFailureEvent: JTUtil.logFailureEvent,

    // JTLookupUtil methods
    getLookupTable: JTLookupUtil.getLookupTable,
    getLookupTableValue: JTLookupUtil.getLookupTableValue,
}

/** Proxy-based catch-all for unknown platform methods */
export const jtShims = new Proxy(jtShimsBase, {
    get(target, prop: string | symbol) {
        if (typeof prop === "symbol") return undefined
        if (prop in target) return target[prop]
        // Catch-all for any unknown platform method
        return (...args: unknown[]) => {
            console.warn(`[jtShims.${prop}] Platform API not available — returning null`, args)
            return null
        }
    },
})

// ============================================================
// 7.8 — String Utility Shims
// ============================================================

/**
 * Java String.format() shim.
 * Handles common format specifiers: %s, %d, %.Nf, %n, %%
 */
export function stringFormat(fmt: string, ...args: unknown[]): string {
    let argIndex = 0
    return fmt.replace(/%(%|n|s|d|(?:\.\d+)?f)/g, (match, spec: string) => {
        if (spec === "%") return "%"
        if (spec === "n") return "\n"

        const arg = args[argIndex++]

        if (spec === "s") {
            return String(arg ?? "")
        }
        if (spec === "d") {
            return String(Math.floor(Number(arg ?? 0)))
        }
        if (spec === "f" || spec.endsWith("f")) {
            const num = Number(arg ?? 0)
            if (spec === "f") return num.toFixed(6) // Java default
            const places = parseInt(spec.slice(1, -1), 10)
            return num.toFixed(places)
        }

        return match // Unrecognized — return as-is
    })
}

// ============================================================
// 7.9 — Shim Injection API
// ============================================================

/** All shim functions bundled for direct use */
export interface GroovyShimLibrary {
    createDateFormatter: typeof createDateFormatter
    parseZonedDateTime: typeof parseZonedDateTime
    nowLocalDate: typeof nowLocalDate
    nowZonedDateTime: typeof nowZonedDateTime
    fromEpochSecond: typeof fromEpochSecond
    roundTo: typeof roundTo
    bigDecimal: typeof bigDecimal
    chunkArray: typeof chunkArray
    sum: typeof sum
    findResult: typeof findResult
    getISOCountries: typeof getISOCountries
    getISO3Country: typeof getISO3Country
    createLocale: typeof createLocale
    getText: typeof getText
    deepFindAll: typeof deepFindAll
    xmlProxy: typeof xmlProxy
    jtShims: typeof jtShims
    stringFormat: typeof stringFormat
    JTJSONObject: typeof JTJSONObject
    JsonSlurper: typeof JsonSlurper
}

/** Object containing all shim functions for direct use in new Function() scope */
export const groovyShims: GroovyShimLibrary = {
    createDateFormatter,
    parseZonedDateTime,
    nowLocalDate,
    nowZonedDateTime,
    fromEpochSecond,
    roundTo,
    bigDecimal,
    chunkArray,
    sum,
    findResult,
    getISOCountries,
    getISO3Country,
    createLocale,
    getText,
    deepFindAll,
    xmlProxy,
    jtShims,
    stringFormat,
    JTJSONObject,
    JsonSlurper,
}

/**
 * Returns a string of JavaScript code that defines all shim functions.
 * This code is prepended to transpiled Groovy scripts before execution.
 *
 * The approach: rather than inlining all function source code (fragile),
 * we inject the shims as additional named parameters to new Function().
 * This function returns the parameter names for the function constructor.
 */
export function getGroovyShimParamNames(): string[] {
    return Object.keys(groovyShims)
}

/** Returns the corresponding argument values in the same order */
export function getGroovyShimParamValues(): unknown[] {
    return Object.values(groovyShims)
}

/**
 * Alternative: returns a self-contained JS code string that defines all shims
 * as local variables. This can be prepended to the script body.
 *
 * Uses a more robust approach — the shim functions are serialized into the
 * script source. This is useful for contexts where you can't control the
 * Function constructor parameters.
 */
export function getGroovyShimsCode(): string {
    // We generate inline definitions for each shim function.
    // Complex shims (like the full ISO country map) are included as data.
    return `
// --- Groovy Shim Library (auto-injected) ---

${createDateFormatter.toString()}
${tokenizePattern.toString()}
${pad.toString()}
${formatToken.toString()}
${buildParseRegex.toString()}
${escapeRegex.toString()}

const DAY_NAMES_SHORT = ${JSON.stringify(DAY_NAMES_SHORT)};
const DAY_NAMES_LONG = ${JSON.stringify(DAY_NAMES_LONG)};
const MONTH_NAMES_SHORT = ${JSON.stringify(MONTH_NAMES_SHORT)};
const MONTH_NAMES_LONG = ${JSON.stringify(MONTH_NAMES_LONG)};

${parseZonedDateTime.toString()}
${nowLocalDate.toString()}
${nowZonedDateTime.toString()}
${fromEpochSecond.toString()}
${roundTo.toString()}
${bigDecimal.toString()}
function toNumber(v) { return typeof v === 'number' ? v : v.value; }
${chunkArray.toString()}
${sum.toString()}
${findResult.toString()}

const ISO_COUNTRIES = ${JSON.stringify(ISO_COUNTRIES)};
${getISOCountries.toString()}
${getISO3Country.toString()}
${createLocale.toString()}

${getText.toString()}
${deepFindAll.toString()}
${xmlProxy.toString()}

const jtShims = new Proxy({
    getGlobalData: function(...args) { console.warn('[JTUtil.getGlobalData] Platform API not available — returning null', args); return null; },
    logFailureEvent: function(...args) { console.error('[JTUtil.logFailureEvent]', ...args); },
    getLookupTable: function(...args) { console.warn('[JTLookupUtil.getLookupTable] Platform API not available — returning {}', args); return {}; },
    getLookupTableValue: function(...args) { console.warn('[JTLookupUtil.getLookupTableValue] Platform API not available — returning null', args); return null; },
}, {
    get(target, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop in target) return target[prop];
        return function(...args) { console.warn('[jtShims.' + prop + '] Platform API not available — returning null', args); return null; };
    }
});

${stringFormat.toString()}

class JTJSONObject {
    constructor(initial) {
        if (typeof initial === 'string') { this.data = JSON.parse(initial); }
        else { this.data = initial || {}; }
    }
    put(key, value) { this.data[key] = value; }
    get(key) { return this.data[key] ?? null; }
    toString() { return JSON.stringify(this.data); }
    toJSON() { return this.data; }
}

const JsonSlurper = { parseText: function(s) { return JSON.parse(s); } };

// --- End Groovy Shim Library ---
`
}
