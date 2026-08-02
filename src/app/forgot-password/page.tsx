/**
 * STORY-auth-008: /forgot-password page — renders the forgot password form
 * with dark-mode design tokens and responsive layout.
 *
 * Allows users to request a password reset link. Always returns a confirmation
 * regardless of whether the email exists (prevents account enumeration).
 */
'use client';

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No worries, we&apos;ll send you reset instructions.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
