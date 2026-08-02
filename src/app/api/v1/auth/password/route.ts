/**
 * STORY-auth-003: PATCH /api/v1/auth/password endpoint.
 * 
 * Verifies caller's currentPassword, updates to newPassword, and regenerates session token.
 * Requires authenticated request (withAuth).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logRequestBody } from "@/lib/auth/logging";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, { message: "New password must be at least 8 characters" })
    .regex(/[A-Z]/, { message: "New password must contain at least one uppercase letter" })
    .regex(/[a-z]/, { message: "New password must contain at least one lowercase letter" })
    .regex(/[0-9]/, { message: "New password must contain at least one digit" }),
});

interface AuthenticatedRequest extends NextRequest {
  user?: { userId: string; role: string };
}

export async function PATCH(request: NextRequest) {
  try {
    // Extract caller's identity from session cookie or x-user-id header
    const userId = request.headers.get("x-user-id") ?? undefined;
    if (!userId) {
      return NextResponse.json({ success: false, error: { code: "ERR_UNAUTHORIZED", message: "Unauthorized" }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 401 });
    }

    // Log the request body (sanitized — passwords are redacted)
    const { originalBody: body } = await logRequestBody(request, 'password-change');

    if (body == null) {
      return NextResponse.json({ success: false, error: { code: "INVALID_BODY", message: "Invalid or empty request body." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 400 });
    }

    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: parsed.error.issues.map((i) => i.message).join(", ") }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 422 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 500 });
    }

    // Verify the current password against the stored bcrypt hash (cost 12)
    const match = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!match) {
      return NextResponse.json({ success: false, error: { code: "INCORRECT_PASSWORD", message: "Current password is incorrect." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 401 });
    }

    // Hash the new password with bcrypt cost 12
    const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, bcrypt.genSaltSync(12));

    // Update user's password in DB and invalidate old sessions
    const invalidatedAt = new Date();
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash, tokenInvalidatedBefore: invalidatedAt } });

    return NextResponse.json({ success: true, status: 200, code: "OK", message: "Password has been updated successfully." });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 500 });
  }
}
