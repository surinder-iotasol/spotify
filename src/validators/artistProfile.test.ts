/**
 * STORY-profile-002: Unit tests for artist profile validation helpers.
 *
 * Covers:
 *  - validateDisplayName: trimming, length bounds, empty input
 *  - validateBio: max length enforcement
 *  - validateSocialLinks: array bounds, HTTPS URL check, platform check
 *  - validateArtistProfileUpdate: combined validation with Zod schema
 *  - Error payload generation with correct codes and paths
 */

import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  validateBio,
  validateSocialLinks,
  validateArtistProfileUpdate,
  ARTIST_PROFILE_VALIDATION_ERRORS,
  type ValidatedSocialLink,
} from "./artistProfile";

/* ------------------------------------------------------------------ */
/*  Tests: validateDisplayName                                         */
/* ------------------------------------------------------------------ */

describe("validateDisplayName", () => {
  it("validates a normal display name", () => {
    const result = validateDisplayName("TestArtist");
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("TestArtist");
  });

  it("trims whitespace from the display name", () => {
    const result = validateDisplayName("  TestArtist  ");
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("TestArtist");
  });

  it("rejects an empty display name", () => {
    const result = validateDisplayName("");
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );
    expect((result as any).error?.path).toEqual(["displayName"]);
  });

  it("rejects a display name with only whitespace", () => {
    const result = validateDisplayName("   ");
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );
  });

  it("accepts a display name at the minimum length (1 char)", () => {
    const result = validateDisplayName("A");
    expect(result.ok).toBe(true);
  });

  it("accepts a display name at the maximum length (50 chars)", () => {
    const result = validateDisplayName("A".repeat(50));
    expect(result.ok).toBe(true);
  });

  it("rejects a display name exceeding 50 characters", () => {
    const result = validateDisplayName("A".repeat(51));
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );
  });

  it("returns null error (skip) for undefined input", () => {
    const result = validateDisplayName(undefined);
    expect(result.ok).toBe(false);
    expect((result as any).error).toBe(null);
  });

  it("returns null error (skip) for null input", () => {
    const result = validateDisplayName(null);
    expect(result.ok).toBe(false);
    expect((result as any).error).toBe(null);
  });

  it("coerces non-string input to string", () => {
    const result = validateDisplayName(42);
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("42");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: validateBio                                                 */
/* ------------------------------------------------------------------ */

describe("validateBio", () => {
  it("validates a normal bio", () => {
    const result = validateBio("Independent musician from NYC");
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("Independent musician from NYC");
  });

  it("accepts an empty bio string", () => {
    const result = validateBio("");
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("");
  });

  it("accepts a bio at the maximum length (500 chars)", () => {
    const result = validateBio("A".repeat(500));
    expect(result.ok).toBe(true);
  });

  it("rejects a bio exceeding 500 characters", () => {
    const result = validateBio("A".repeat(501));
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.BIO_TOO_LONG,
    );
    expect((result as any).error?.path).toEqual(["bio"]);
    expect((result as any).error?.message).toBe("Bio must not exceed 500 characters");
  });

  it("returns null error (skip) for undefined input", () => {
    const result = validateBio(undefined);
    expect(result.ok).toBe(false);
    expect((result as any).error).toBe(null);
  });

  it("coerces non-string input to string", () => {
    const result = validateBio(123);
    expect(result.ok).toBe(true);
    expect((result as any).data).toBe("123");
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: validateSocialLinks                                         */
/* ------------------------------------------------------------------ */

describe("validateSocialLinks", () => {
  it("validates a single social link with HTTPS URL", () => {
    const input = [{ platform: "twitter", url: "https://twitter.com/artist" }];
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(true);
    const links = (result as any).data as ValidatedSocialLink[];
    expect(links).toHaveLength(1);
    expect(links[0].platform).toBe("twitter");
    expect(links[0].url).toBe("https://twitter.com/artist");
  });

  it("validates multiple social links up to the limit", () => {
    const input = [
      { platform: "twitter", url: "https://twitter.com/artist" },
      { platform: "instagram", url: "https://instagram.com/artist" },
      { platform: "youtube", url: "https://youtube.com/artist" },
    ];
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(true);
    expect((result as any).data).toHaveLength(3);
  });

  it("rejects more than 5 social links", () => {
    const input = Array(6).fill({ platform: "twitter", url: "https://twitter.com/artist" });
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
    expect((result as any).error?.path).toEqual(["socialLinks"]);
  });

  it("accepts exactly 5 social links", () => {
    const input = Array(5).fill({ platform: "twitter", url: "https://twitter.com/artist" });
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(true);
    expect((result as any).data).toHaveLength(5);
  });

  it("rejects a non-HTTPS URL", () => {
    const input = [{ platform: "twitter", url: "http://twitter.com/artist" }];
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
    expect((result as any).error?.path).toEqual(["socialLinks[0].url"]);
  });

  it("rejects a missing platform field", () => {
    const input = [{ url: "https://twitter.com/artist" }];
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
    expect((result as any).error?.path).toEqual(["socialLinks[0].platform"]);
  });

  it("rejects a missing URL field", () => {
    const input = [{ platform: "twitter" }];
    const result = validateSocialLinks(input);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
    expect((result as any).error?.path).toEqual(["socialLinks[0].url"]);
  });

  it("rejects a non-array input", () => {
    const result = validateSocialLinks("not an array");
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
  });

  it("returns null error (skip) for undefined input", () => {
    const result = validateSocialLinks(undefined);
    expect(result.ok).toBe(false);
    expect((result as any).error).toBe(null);
  });

  it("returns null error (skip) for null input", () => {
    const result = validateSocialLinks(null);
    expect(result.ok).toBe(false);
    expect((result as any).error).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: validateArtistProfileUpdate (combined)                      */
/* ------------------------------------------------------------------ */

describe("validateArtistProfileUpdate", () => {
  it("validates a complete payload with all fields", () => {
    const body = {
      displayName: "TestArtist",
      bio: "A bio",
      socialLinks: [{ platform: "twitter", url: "https://twitter.com/artist" }],
    };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(true);
    expect((result as any).data.displayName).toBe("TestArtist");
    expect((result as any).data.bio).toBe("A bio");
    expect((result as any).data.socialLinks).toHaveLength(1);
  });

  it("validates a partial payload (only displayName)", () => {
    const body = { displayName: "NewName" };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(true);
    expect((result as any).data.displayName).toBe("NewName");
    expect((result as any).data.socialLinks).toBeUndefined();
  });

  it("validates an empty object (all fields optional)", () => {
    const result = validateArtistProfileUpdate({});
    expect(result.ok).toBe(true);
  });

  it("rejects null body", () => {
    const result = validateArtistProfileUpdate(null);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe("VALIDATION_BODY_EMPTY");
  });

  it("rejects undefined body", () => {
    const result = validateArtistProfileUpdate(undefined);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe("VALIDATION_BODY_EMPTY");
  });

  it("returns INVALID_DISPLAY_NAME for displayName exceeding 50 chars", () => {
    const body = { displayName: "A".repeat(51) };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );
  });

  it("returns INVALID_DISPLAY_NAME for empty displayName", () => {
    const body = { displayName: "" };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );
  });

  it("returns BIO_TOO_LONG for bio exceeding 500 chars", () => {
    const body = { bio: "A".repeat(501) };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.BIO_TOO_LONG,
    );
  });

  it("returns INVALID_SOCIAL_LINKS for more than 5 social links", () => {
    const body = {
      socialLinks: Array(6).fill({ platform: "x", url: "https://x.com/a" }),
    };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
  });

  it("returns INVALID_SOCIAL_LINKS for a non-HTTPS URL", () => {
    const body = {
      socialLinks: [{ platform: "x", url: "http://x.com/a" }],
    };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    expect((result as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
  });

  it("trims displayName in the validated output", () => {
    const body = { displayName: "  Trimmed  " };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(true);
    expect((result as any).data.displayName).toBe("Trimmed");
  });

  it("trims social link URLs and platforms in the validated output", () => {
    const body = {
      socialLinks: [{ platform: "  twitter  ", url: "  https://twitter.com/artist  " }],
    };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(true);
    const links = (result as any).data.socialLinks as ValidatedSocialLink[];
    expect(links[0].platform).toBe("twitter");
    expect(links[0].url).toBe("https://twitter.com/artist");
  });

  it("generates correct error payload structure", () => {
    const body = { displayName: "A".repeat(51) };
    const result = validateArtistProfileUpdate(body);
    expect(result.ok).toBe(false);
    const error = (result as any).error;
    expect(error.code).toBeDefined();
    expect(error.path).toBeDefined();
    expect(error.message).toBeDefined();
    expect(typeof error.code).toBe("string");
    expect(Array.isArray(error.path)).toBe(true);
    expect(typeof error.message).toBe("string");
  });

  it("exercises all three error codes from ARTIST_PROFILE_VALIDATION_ERRORS", () => {
    // INVALID_DISPLAY_NAME
    const nameResult = validateArtistProfileUpdate({ displayName: "" });
    expect(nameResult.ok).toBe(false);
    expect((nameResult as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
    );

    // BIO_TOO_LONG
    const bioResult = validateArtistProfileUpdate({ bio: "A".repeat(501) });
    expect(bioResult.ok).toBe(false);
    expect((bioResult as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.BIO_TOO_LONG,
    );

    // INVALID_SOCIAL_LINKS
    const socialResult = validateArtistProfileUpdate({
      socialLinks: [{ platform: "x", url: "http://x.com/a" }],
    });
    expect(socialResult.ok).toBe(false);
    expect((socialResult as any).error?.code).toBe(
      ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
    );
  });
});
