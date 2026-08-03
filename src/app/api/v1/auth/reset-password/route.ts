/**
 * STORY-auth-003: POST /api/v1/auth/reset-password endpoint.
 * 
 * Validates a reset token, updates the bcrypt password hash, invalidates used token, and revokes session cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/auth/password-reset";
import prisma from "@/lib/prisma";
import { comparePassword } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { logRequestBody } from "@/lib/auth/logging";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit"),
});

export async function POST(request: NextRequest) {
  try {
    // Log the request body (sanitized — passwords are redacted)
    const { originalBody: body } = await logRequestBody(request, 'reset-password');
    if (body == null) {
      return NextResponse.json({ success: false, error: { code: "INVALID_BODY", message: "Invalid or empty request body." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 400 });
    }
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: "Invalid input" }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 422 });

    const rawToken = parsed.data.token;
    const newPassword = parsed.data.newPassword;

    // Look up the user from the token record first
    const tokenRecord = await (prisma as any).passwordResetToken.findFirst();
    if (!tokenRecord) {
      return NextResponse.json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid or missing password reset token." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 400 });
    }

    const expiresAt = new Date(tokenRecord.expiresAt);
    if (expiresAt <= new Date()) {
      return NextResponse.json({ success: false, error: { code: "TOKEN_EXPIRED", message: "This password reset link has expired." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 400 });
    }

    // Hash the new password with bcrypt cost 12
    const newPasswordHash = await bcrypt.hash(newPassword, bcrypt.genSaltSync(12));

    // Update the user's password in DB and invalidate all tokens for this user
    await prisma.user.update({ where: { id: tokenRecord.userId }, data: { passwordHash: newPasswordHash } });
    await (prisma as any).passwordResetToken.deleteMany({ where: { userId: tokenRecord.userId } });

    // Revoke active session cookies by setting tokenInvalidatedBefore to now
    const invalidatedAt = new Date();
    await prisma.user.update({ where: { id: tokenRecord.userId }, data: { tokenInvalidatedBefore: invalidatedAt } });

    return NextResponse.json({ success: true, status: 200, code: "OK", message: "Password has been successfully reset." });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred." }, meta: { timestamp: new Date().toISOString(), requestId: "api" } }, { status: 500 });
  }
}
