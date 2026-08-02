/**
 * STORY-auth-003: Password Reset and Credential Management service layer.
 * 
 * Provides three public functions:
 * - forgotPassword(email): generates a 60-minute reset token stored as SHA-256 hash
 * - resetPassword(rawToken, newPassword): validates token, updates bcrypt password hash, invalidates used token
 * - changePassword(userId, currentPassword, newPassword): verifies caller's currentPassword, updates to newPassword
 * 
 * All timestamps use UTC ISO-8601 format per constraint 0.
 */

import bcrypt from "bcryptjs";
import { comparePassword } from "@/lib/auth";
import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/* Token generation & hashing                                          */
/* ------------------------------------------------------------------ */

/** Reset token TTL in seconds (60 minutes). */
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 3600

/** Generate a cryptographically secure random hex token string. */
function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Create SHA-256 hash of the raw token for storage in the database. */
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface PrismaClientLike {
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  passwordResetToken: {
    findFirst: () => Promise<{ id: string; userId: string; tokenHash: string; expiresAt: Date } | null>;
    deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
}

export interface ForgotPasswordResult { 
  success: boolean; status: number; code: string; message: string;
  tokenHash?: string; expiresAt?: string; requestId?: string;
}

export interface ResetPasswordResult   { 
  success: boolean; status: number; code: string; message: string;
  newPasswordHash?: string; requestId?: string;
}

export interface ChangePasswordResult  { 
  success: boolean; status: number; code: string; message: string;
  newPasswordHash?: string; sessionToken?: string; requestId?: string;
}

export const PASSWORD_RESET_ERRORS = {
  TOKEN_INVALID: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INCORRECT_PASSWORD: "INCORRECT_PASSWORD",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Generate a request ID for tracing. */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/* ------------------------------------------------------------------ */
/* forgotPassword — POST /api/v1/auth/forgot-password                */
/* ------------------------------------------------------------------ */

/** Generate a password reset token (returns uniform HTTP 200 OK to prevent email enumeration). */
export async function forgotPassword(prisma: PrismaClientLike, email: string): Promise<ForgotPasswordResult> {
  // Look up the user (response is always uniform — prevents email enumeration)
  await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000);

  return {
    success: true, status: 200, code: "OK",
    message: "If an account exists for that email, a password reset link has been sent.",
    tokenHash, expiresAt: expiresAt.toISOString(), requestId: generateRequestId(),
  };
}

/* ------------------------------------------------------------------ */
/* resetPassword — POST /api/v1/auth/reset-password                  */
/* ------------------------------------------------------------------ */

/** Validate a raw reset token and update the user's password (invalidates used token). */
export async function resetPassword(
  prisma: PrismaClientLike, rawToken: string, newPassword: string, userId?: string,
): Promise<ResetPasswordResult> {
  const tokenDigest = hashToken(rawToken);
  
  // Look up an active (non-expired) record matching this token hash
  const validRecord = await prisma.passwordResetToken.findFirst({ where: { tokenHash: tokenDigest } });
  if (!validRecord) {
    return { success: false, status: 400, code: PASSWORD_RESET_ERRORS.TOKEN_INVALID, message: "Invalid or missing password reset token.", requestId: generateRequestId() };
  }

  // Validate token hasn't expired (UTC ISO-8601 timestamps per constraint 0)
  const expiresAt = new Date(validRecord.expiresAt);
  if (expiresAt <= new Date()) {
    return { success: false, status: 400, code: PASSWORD_RESET_ERRORS.TOKEN_EXPIRED, message: "This password reset link has expired.", requestId: generateRequestId() };
  }

  // Hash the new password with bcrypt cost 12 and update in DB
  const newPasswordHash = await bcrypt.hash(newPassword, bcrypt.genSaltSync(12));
  
  // Persist the new password hash to the user record
  await prisma.user.update({ where: { id: validRecord.userId }, data: { passwordHash: newPasswordHash } });

  // Invalidate all previous active reset tokens for this user (one-time use)
  if (validRecord.userId) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: validRecord.userId } });
  }

  return {
    success: true, status: 200, code: "OK",
    message: "Password has been successfully reset.", newPasswordHash, requestId: generateRequestId(),
  };
}

/* ------------------------------------------------------------------ */
/* changePassword — PATCH /api/v1/auth/password                      */
/* ------------------------------------------------------------------ */

/** Verify the caller's current password and update it (regenerates session token). */
export async function changePassword(
  prisma: PrismaClientLike, userId: string, currentPassword: string, newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (!user?.passwordHash) {
    return { success: false, status: 500, code: PASSWORD_RESET_ERRORS.INTERNAL_ERROR, message: "An internal error occurred.", requestId: generateRequestId() };
  }

  // Verify the current password against the stored bcrypt hash (cost 12)
  const match = await comparePassword(currentPassword, String(user.passwordHash));
  if (!match) {
    return { success: false, status: 401, code: PASSWORD_RESET_ERRORS.INCORRECT_PASSWORD, message: "Current password is incorrect.", requestId: generateRequestId() };
  }

  // Hash the new password with bcrypt cost 12
  const newPasswordHash = await bcrypt.hash(newPassword, bcrypt.genSaltSync(12));

  // Persist the new password hash to the user record
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } });

  return {
    success: true, status: 200, code: "OK",
    message: "Password has been updated successfully.", newPasswordHash, requestId: generateRequestId(),
  };
}
