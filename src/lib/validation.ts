/**
 * Input validation utilities for API routes.
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: true;
  data: T;
}

export interface ValidationFailure {
  ok: false;
  errors: ValidationError[];
}

export type Validated<T> = ValidationResult<T> | ValidationFailure;

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,25}$/;

export function validateUsername(raw: string): Validated<string> {
  const trimmed = raw.trim().toLowerCase();
  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      ok: false,
      errors: [
        {
          field: "username",
          message:
            "Username must be 3-25 characters and contain only letters, numbers, hyphens, or underscores.",
        },
      ],
    };
  }
  return { ok: true, data: trimmed };
}

export function validateMonths(raw: string | null): Validated<number> {
  const value = parseInt(raw ?? "6", 10);
  if (Number.isNaN(value) || value < 1 || value > 24) {
    return {
      ok: false,
      errors: [
        { field: "months", message: "months must be an integer between 1 and 24." },
      ],
    };
  }
  return { ok: true, data: value };
}

const VALID_TIME_CLASSES = ["all", "bullet", "blitz", "rapid"] as const;
export type ValidTimeClass = (typeof VALID_TIME_CLASSES)[number];

export function validateTimeClass(raw: string | null): Validated<ValidTimeClass> {
  const value = (raw ?? "all") as ValidTimeClass;
  if (!VALID_TIME_CLASSES.includes(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "timeClass",
          message: `timeClass must be one of: ${VALID_TIME_CLASSES.join(", ")}.`,
        },
      ],
    };
  }
  return { ok: true, data: value };
}

/**
 * Basic FEN plausibility check.
 * A full FEN has 6 space-separated fields; we at least verify
 * the piece placement field looks reasonable.
 */
const FEN_PIECE_PLACEMENT_REGEX = /^[rnbqkpRNBQKP1-8/]+$/;

export function validateFen(raw: string | null): Validated<string> {
  if (!raw || raw.trim().length === 0) {
    return {
      ok: false,
      errors: [{ field: "fen", message: "fen parameter is required." }],
    };
  }
  const parts = raw.trim().split(" ");
  if (parts.length < 1 || !FEN_PIECE_PLACEMENT_REGEX.test(parts[0])) {
    return {
      ok: false,
      errors: [{ field: "fen", message: "fen does not look like a valid FEN string." }],
    };
  }
  return { ok: true, data: raw.trim() };
}

const VALID_SPEEDS = new Set([
  "ultraBullet",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
]);

export function validateSpeeds(raw: string | null): Validated<string> {
  const value = raw ?? "blitz,rapid";
  const parts = value.split(",");
  for (const p of parts) {
    if (!VALID_SPEEDS.has(p.trim())) {
      return {
        ok: false,
        errors: [
          {
            field: "speeds",
            message: `Invalid speed "${p.trim()}". Valid values: ${[...VALID_SPEEDS].join(", ")}.`,
          },
        ],
      };
    }
  }
  return { ok: true, data: value };
}

const VALID_RATINGS = new Set([
  "0",
  "1000",
  "1200",
  "1400",
  "1600",
  "1800",
  "2000",
  "2200",
  "2500",
]);

export function validateRatings(raw: string | null): Validated<string> {
  const value = raw ?? "1600,1800";
  const parts = value.split(",");
  for (const p of parts) {
    if (!VALID_RATINGS.has(p.trim())) {
      return {
        ok: false,
        errors: [
          {
            field: "ratings",
            message: `Invalid rating "${p.trim()}". Valid values: ${[...VALID_RATINGS].join(", ")}.`,
          },
        ],
      };
    }
  }
  return { ok: true, data: value };
}

/**
 * Validate an optional `since` Unix timestamp (seconds).
 * Returns null when omitted (meaning "no date filter").
 * Rejects timestamps in the future or before 2010-01-01.
 */
const MIN_SINCE = 1262304000; // 2010-01-01T00:00:00Z

export function validateSince(raw: string | null): Validated<number | null> {
  if (!raw || raw.trim().length === 0) {
    return { ok: true, data: null };
  }
  const value = parseInt(raw, 10);
  if (Number.isNaN(value)) {
    return {
      ok: false,
      errors: [{ field: "since", message: "since must be a Unix timestamp in seconds." }],
    };
  }
  const now = Math.floor(Date.now() / 1000);
  if (value < MIN_SINCE || value > now) {
    return {
      ok: false,
      errors: [
        {
          field: "since",
          message: `since must be between ${MIN_SINCE} (2010-01-01) and ${now} (now).`,
        },
      ],
    };
  }
  return { ok: true, data: value };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect errors from multiple validation results.
 * Returns null if all are valid, otherwise an array of all errors.
 *
 * When this returns `null` it is safe to access `.data` on each result
 * (guard with a non-null assertion or a type cast after the check).
 */
export function collectErrors(
  ...results: Validated<unknown>[]
): ValidationError[] | null {
  const errors: ValidationError[] = [];
  for (const r of results) {
    if (!r.ok) errors.push(...r.errors);
  }
  return errors.length > 0 ? errors : null;
}

/** Narrow a validated result after collectErrors returned null. */
export function unwrap<T>(v: Validated<T>): T {
  if (!v.ok) throw new Error("Tried to unwrap a failed validation");
  return v.data;
}

// ---------------------------------------------------------------------------
// Prep project validators
// ---------------------------------------------------------------------------

const PREP_COLORS = ["white", "black"] as const;
export type PrepColor = (typeof PREP_COLORS)[number];

export function validatePrepColor(raw: string | null): Validated<PrepColor> {
  const value = (raw ?? "").toLowerCase() as PrepColor;
  if (!PREP_COLORS.includes(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "color",
          message: `color must be one of: ${PREP_COLORS.join(", ")}.`,
        },
      ],
    };
  }
  return { ok: true, data: value };
}

/** Rating bucket format: e.g. "1600-1800". */
const RATING_BUCKET_REGEX = /^\d{3,4}-\d{3,4}$/;

export function validateRatingBucket(raw: string | null): Validated<string> {
  if (!raw || raw.trim().length === 0) {
    return {
      ok: false,
      errors: [{ field: "ratingBucket", message: "ratingBucket is required." }],
    };
  }
  const value = raw.trim();
  if (!RATING_BUCKET_REGEX.test(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "ratingBucket",
          message: "ratingBucket must be like 1600-1800.",
        },
      ],
    };
  }
  return { ok: true, data: value };
}
