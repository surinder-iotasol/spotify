/**
 * STORY-role-006: Email verification landing page (/verify-email).
 *
 * Extracts the `token` query parameter on mount, calls
 * POST /api/v1/auth/verify-email/confirm, and renders:
 *   - Loading state while the API request is in flight
 *   - Success state with a "Go to Dashboard" link on HTTP 200
 *   - Error state with a "Resend Verification Email" button on failure
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VerifyResponse {
  success: boolean;
  data?: {
    verified?: boolean;
    message?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

type VerificationState = 'loading' | 'success' | 'error';

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resending, setResending] = useState(false);

  const token = searchParams.get('token');

  /** Call the confirm endpoint with the extracted token. */
  const verifyEmail = useCallback(async (tok: string) => {
    try {
      const res = await fetch('/api/v1/auth/verify-email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok }),
      });

      const data: VerifyResponse = await res.json();

      if (res.ok && data.success) {
        setState('success');
      } else {
        setState('error');
        setErrorMessage(data.error?.message ?? 'Verification failed. Please try again.');
      }
    } catch {
      setState('error');
      setErrorMessage('An unexpected error occurred. Please try again.');
    }
  }, []);

  /** Trigger on mount (and token change). */
  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No verification token provided.');
      return;
    }
    verifyEmail(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, verifyEmail]);

  /** Resend verification email. */
  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      const res = await fetch('/api/v1/auth/verify-email/request', {
        method: 'POST',
      });
      const data: VerifyResponse = await res.json();
      if (res.ok && data.success) {
        setErrorMessage('A new verification email has been sent. Please check your inbox.');
      }
    } catch {
      setErrorMessage('Failed to resend verification email. Please try again.');
    } finally {
      setResending(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* Loading state */}
        {state === 'loading' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-4">
              Verifying your email
            </h1>
            <p className="text-muted-foreground">
              Please wait while we verify your email address...
            </p>
          </div>
        )}

        {/* Success state */}
        {state === 'success' && (
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <svg
                  className="h-8 w-8 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Email verified successfully!
            </h1>
            <p className="text-muted-foreground mb-6">
              Your email has been verified. You can now upload and manage your tracks.
            </p>
            <Link href="/upload">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Go to Dashboard
              </button>
            </Link>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                <svg
                  className="h-8 w-8 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Verification failed
            </h1>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
