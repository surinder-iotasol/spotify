/**
 * STORY-auth-008: /reset-password page — renders the reset password form
 * with dark-mode design tokens and responsive layout.
 *
 * Extracts the reset token from the URL query parameter "token" and passes
 * it to the form component for password submission.
 */
'use client';

import { useSearchParams } from 'next/navigation';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

/**
 * Wrapper component that extracts the token from the URL and passes it down.
 * This is required because Next.js App Router page components are Server Components
 * by default, but we need client-side URL access.
 */
function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your new password below.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <ResetPasswordPageContent />;
}
