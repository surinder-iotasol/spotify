/**
 * STORY-profile-002: Artist Profile Validation Helpers
 *
 * Validates payload fields for the PATCH /api/v1/artist-profile endpoint.
 * Each function returns either a valid result or a validation error detail.
 */

import { type ZodSchema, z } from "zod";

/* ------------------------------------------------------------------ */
/*  Error codes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Validation error codes for artist profile updates.
 */
export const ARTIST_PROFILE_VALIDATION_ERRORS = {
  INVALID_DISPLAY_NAME: "INVALID_DISPLAY_NAME",
  BIO_TOO_LONG: "BIO_TOO_LONG",
  INVALID_SOCIAL_LINKS: "INVALID_SOCIAL_LINKS",
} as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * A validated social link entry.
 */
export interface ValidatedSocialLink {
  platform: string;
  url: string;
}

/**
 * Result of validating a single field.
 */
export interface ValidationResult<T = string> {
  ok: boolean;
  error: {
    code: string;
    path: string[];
    message: string;
  } | null;
  data?: T;
}

/**
 * Parsed and validated update input for artist profile.
 */
export interface ArtistProfileUpdateInput {
  displayName?: string;
  bio?: string;
  socialLinks?: ValidatedSocialLink[];
}

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

/**
 * Zod schema for a single social link entry.
 * - platform must be a non-empty string
 * - url must be a valid HTTPS URL
 */
export const socialLinkSchema: ZodSchema<ValidatedSocialLink> = z.object({
  platform: z
    .string()
    .min(1, "Platform is required")
    .trim(),
  url: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => url.startsWith("https://"),
      { message: "URL must use HTTPS" },
    ),
});

/**
 * Zod schema for the full artist profile update payload.
 * All fields are optional so clients can patch selectively.
 * No defaults — only included fields get validated and returned.
 */
export const artistProfileUpdateSchema: ZodSchema<ArtistProfileUpdateInput> =
  z.object({
    displayName: z
      .string()
      .min(1, "Display name must be between 1 and 50 characters")
      .max(50, "Display name must be between 1 and 50 characters")
      .optional(),
    bio: z
      .string()
      .max(500, "Bio must not exceed 500 characters")
      .optional(),
    socialLinks: z
      .array(socialLinkSchema)
      .max(5, "Social links must not exceed 5 entries")
      .optional(),
  }).partial();

/* ------------------------------------------------------------------ */
/*  Validation helper functions                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate a display name value.
 *
 * @param input - The raw input value (will be coerced to string if needed).
 * @returns Validated trimmed string, or a validation error detail.
 *
 * Rules:
 *  - Must be 1-50 characters after trimming.
 *  - Returns INVALID_DISPLAY_NAME on failure.
 */
export function validateDisplayName(
  input: unknown,
): ValidationResult {
  if (input === undefined || input === null) {
    return { ok: false, error: null, data: undefined };
  }

  const value = typeof input === "string" ? input.trim() : String(input).trim();

  if (value.length === 0) {
    return {
      ok: false,
      error: {
        code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
        path: ["displayName"],
        message: "Display name must be between 1 and 50 characters",
      },
    };
  }

  if (value.length > 50) {
    return {
      ok: false,
      error: {
        code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME,
        path: ["displayName"],
        message: "Display name must be between 1 and 50 characters",
      },
    };
  }

  return { ok: true, error: null, data: value };
}

/**
 * Validate a bio value.
 *
 * @param input - The raw input value (will be coerced to string if needed).
 * @returns Validated string, or a validation error detail.
 *
 * Rules:
 *  - Must be at most 500 characters.
 *  - Returns BIO_TOO_LONG on failure.
 */
export function validateBio(input: unknown): ValidationResult {
  if (input === undefined || input === null) {
    return { ok: false, error: null, data: undefined };
  }

  const value = typeof input === "string" ? input : String(input);

  if (value.length > 500) {
    return {
      ok: false,
      error: {
        code: ARTIST_PROFILE_VALIDATION_ERRORS.BIO_TOO_LONG,
        path: ["bio"],
        message: "Bio must not exceed 500 characters",
      },
    };
  }

  return { ok: true, error: null, data: value };
}

/**
 * Validate social links array.
 *
 * @param input - The raw input value (should be an array).
 * @returns Array of validated social links, or a validation error detail.
 *
 * Rules:
 *  - Must be an array with 1-5 items.
 *  - Each item must have a valid `platform` string and valid HTTPS URL.
 *  - Returns INVALID_SOCIAL_LINKS on failure.
 */
export function validateSocialLinks(
  input: unknown,
): ValidationResult<ValidatedSocialLink[]> {
  if (input === undefined || input === null) {
    return { ok: false, error: null, data: undefined };
  }

  if (!Array.isArray(input)) {
    return {
      ok: false,
      error: {
        code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
        path: ["socialLinks"],
        message: "Social links must be an array of up to 5 items",
      },
    };
  }

  if (input.length > 5) {
    return {
      ok: false,
      error: {
        code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
        path: ["socialLinks"],
        message: "Social links must not exceed 5 entries",
      },
    };
  }

  const validated: ValidatedSocialLink[] = [];

  for (let i = 0; i < input.length; i++) {
    const entry = input[i];

    if (!entry || typeof entry !== "object") {
      return {
        ok: false,
        error: {
          code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
          path: [`socialLinks[${i}]`],
          message: `Social link at index ${i} must be a valid object`,
        },
      };
    }

    const platform = (entry as Record<string, unknown>).platform;
    const url = (entry as Record<string, unknown>).url;

    // Validate platform
    if (
      !platform ||
      typeof platform !== "string" ||
      platform.trim().length === 0
    ) {
      return {
        ok: false,
        error: {
          code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
          path: [`socialLinks[${i}].platform`],
          message: `Platform is required at index ${i}`,
        },
      };
    }

    // Validate URL
    if (!url || typeof url !== "string") {
      return {
        ok: false,
        error: {
          code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
          path: [`socialLinks[${i}].url`],
          message: `URL is required at index ${i}`,
        },
      };
    }

    // Check HTTPS
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        ok: false,
        error: {
          code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
          path: [`socialLinks[${i}].url`],
          message: `URL must be valid at index ${i}`,
        },
      };
    }

    if (parsedUrl.protocol !== "https:") {
      return {
        ok: false,
        error: {
          code: ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS,
          path: [`socialLinks[${i}].url`],
          message: `URL must use HTTPS at index ${i}`,
        },
      };
    }

    validated.push({
      platform: platform.trim(),
      url: url.trim(),
    });
  }

  return { ok: true, error: null, data: validated };
}

/* ------------------------------------------------------------------ */
/*  Combined validation                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a full artist profile update payload.
 *
 * @param body - The parsed request body.
 * @returns Validated and trimmed input, or the first validation error found.
 */
export function validateArtistProfileUpdate(
  body: unknown,
): {
  ok: true;
  data: ArtistProfileUpdateInput;
} | {
  ok: false;
  error: {
    code: string;
    path: string[];
    message: string;
  };
} {
  if (body === undefined || body === null) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_BODY_EMPTY",
        path: [],
        message: "Request body is required and must be valid JSON.",
      },
    };
  }

  // Use Zod schema for combined validation
  const result = artistProfileUpdateSchema.safeParse(body);

  if (!result.success) {
    // Map Zod errors to our error codes
    for (const issue of result.error.issues) {
      const path = issue.path.map(String);

      // Determine the error code based on the path
      let code: string;
      let message: string;

      if (path[0] === "displayName") {
        code = ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_DISPLAY_NAME;
        message = "Display name must be between 1 and 50 characters";
      } else if (path[0] === "bio") {
        code = ARTIST_PROFILE_VALIDATION_ERRORS.BIO_TOO_LONG;
        message = "Bio must not exceed 500 characters";
      } else if (path[0] === "socialLinks") {
        code = ARTIST_PROFILE_VALIDATION_ERRORS.INVALID_SOCIAL_LINKS;
        message = "Social links validation failed";
        if (issue.message) {
          message = issue.message;
        }
      } else {
        code = "INVALID_INPUT";
        message = issue.message;
      }

      return {
        ok: false,
        error: { code, path, message },
      };
    }

    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        path: [],
        message: "Invalid request body.",
      },
    };
  }

  // Build the trimmed/cleaned input
  const parsed = result.data;
  const output: ArtistProfileUpdateInput = {};

  if (parsed.displayName !== undefined && parsed.displayName !== "") {
    output.displayName = parsed.displayName.trim();
  }

  if (parsed.bio !== undefined) {
    output.bio = parsed.bio.trim();
  }

  if (parsed.socialLinks !== undefined && parsed.socialLinks.length > 0) {
    output.socialLinks = parsed.socialLinks.map((link) => ({
      platform: link.platform.trim(),
      url: link.url.trim(),
    }));
  }

  return { ok: true, data: output };
}
