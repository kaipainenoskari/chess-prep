import { describe, it, expect } from "vitest";
import {
  validateUsername,
  validateMonths,
  validateTimeClass,
  validateFen,
  validateSpeeds,
  validateRatings,
  collectErrors,
  unwrap,
} from "./validation";

// ---------------------------------------------------------------------------
// validateUsername
// ---------------------------------------------------------------------------
describe("validateUsername", () => {
  it("accepts a valid lowercase username", () => {
    const r = validateUsername("hikaru");
    expect(r.ok).toBe(true);
    expect(unwrap(r)).toBe("hikaru");
  });

  it("lowercases the input", () => {
    expect(unwrap(validateUsername("GothamChess"))).toBe("gothamchess");
  });

  it("accepts hyphens and underscores", () => {
    expect(validateUsername("some-user_123").ok).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateUsername("").ok).toBe(false);
  });

  it("rejects too-short username", () => {
    expect(validateUsername("ab").ok).toBe(false);
  });

  it("rejects too-long username (>25 chars)", () => {
    expect(validateUsername("a".repeat(26)).ok).toBe(false);
  });

  it("rejects special characters", () => {
    expect(validateUsername("user@name").ok).toBe(false);
    expect(validateUsername("user name").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMonths
// ---------------------------------------------------------------------------
describe("validateMonths", () => {
  it("defaults to 6 when null", () => {
    expect(unwrap(validateMonths(null))).toBe(6);
  });

  it("parses a valid integer", () => {
    expect(unwrap(validateMonths("12"))).toBe(12);
  });

  it("rejects 0", () => {
    expect(validateMonths("0").ok).toBe(false);
  });

  it("rejects values above 24", () => {
    expect(validateMonths("25").ok).toBe(false);
  });

  it("rejects non-numeric", () => {
    expect(validateMonths("abc").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTimeClass
// ---------------------------------------------------------------------------
describe("validateTimeClass", () => {
  it("defaults to 'all' when null", () => {
    expect(unwrap(validateTimeClass(null))).toBe("all");
  });

  it.each(["all", "bullet", "blitz", "rapid"] as const)("accepts '%s'", (tc) => {
    expect(unwrap(validateTimeClass(tc))).toBe(tc);
  });

  it("rejects invalid time class", () => {
    expect(validateTimeClass("classical").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateFen
// ---------------------------------------------------------------------------
describe("validateFen", () => {
  it("accepts a standard starting position FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(unwrap(validateFen(fen))).toBe(fen);
  });

  it("rejects null", () => {
    expect(validateFen(null).ok).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateFen("").ok).toBe(false);
  });

  it("rejects obviously invalid FEN", () => {
    expect(validateFen("not a fen at all!").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSpeeds
// ---------------------------------------------------------------------------
describe("validateSpeeds", () => {
  it("defaults to 'blitz,rapid'", () => {
    expect(unwrap(validateSpeeds(null))).toBe("blitz,rapid");
  });

  it("accepts valid comma-separated speeds", () => {
    expect(validateSpeeds("bullet,blitz").ok).toBe(true);
  });

  it("rejects unknown speed", () => {
    expect(validateSpeeds("turbo").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRatings
// ---------------------------------------------------------------------------
describe("validateRatings", () => {
  it("defaults to '1600,1800'", () => {
    expect(unwrap(validateRatings(null))).toBe("1600,1800");
  });

  it("accepts valid ratings", () => {
    expect(validateRatings("1400,1600,1800").ok).toBe(true);
  });

  it("rejects arbitrary number", () => {
    expect(validateRatings("1500").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// collectErrors
// ---------------------------------------------------------------------------
describe("collectErrors", () => {
  it("returns null when all valid", () => {
    const a = validateUsername("hikaru");
    const b = validateMonths("6");
    expect(collectErrors(a, b)).toBeNull();
  });

  it("collects errors from multiple failures", () => {
    const a = validateUsername("");
    const b = validateMonths("abc");
    const errors = collectErrors(a, b);
    expect(errors).not.toBeNull();
    expect(errors!.length).toBe(2);
  });
});
