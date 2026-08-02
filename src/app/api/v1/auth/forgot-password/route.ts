/**
 * STORY-auth-003: POST /api/v1/auth/forgot-password endpoint.
 * 
 * Generates a 60-minute reset token stored as SHA-256 hash in DB.
 * Returns uniform HTTP 200 OK regardless of whether user exists (prevents enumeration).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forgotPassword } from "@/lib/auth/password-reset";
import prisma from "@/lib/prisma";
import { logRequestBody } from "@/lib/auth/logging";

const forgotPasswordSchema = z.object({ email: z.string().email("Invalid email address").refine((v) => v.trim().length > 0, "Email is required") });

export async function POST(request: NextRequest) {
  try {
    // 0. Log the request body (sanitized — passwords are redacted)
    const { originalBody: body } = await logRequestBody(request, 'forgot-password');
    if (body == null) {
      return NextResponse.json({ success: false, error: { code: "INVALID_BODY", message: "Invalid or empty request body." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 400 });
    }
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: "Invalid input" }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 422 });

    const email = parsed.data.email.trim().toLowerCase();
    await forgotPassword(prisma, email);

    // Always return HTTP 200 regardless of whether user exists — prevents email enumeration
    return NextResponse.json({ success: true, status: 200, code: "OK", message: "If an account exists for that email, a password reset link has been sent." });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 500 });
  }
}
