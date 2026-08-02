/**
 * STORY-auth-008: Client-side forgot-password form component.
 *
 * Features:
 * - Email field with client-side validation
 * - Confirmation message regardless of email existence (prevents enumeration)
 * - Accessible loading states with aria-disabled
 * - Server error banner (role="alert")
 * - Focus management on validation errors per WCAG 2.1 AA
 * - Links back to sign in and register pages
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateEmail(value: string): string | null {
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Email must be a valid email address';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Form state types                                                   */
/* ------------------------------------------------------------------ */

interface FormErrors {
  email: string | null;
}

interface FormSubmissionResult {
  success: boolean;
  serverError: string | null;
  submitted: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                    */
/* ------------------------------------------------------------------ */

interface ForgotPasswordFormProps {
  /** Optional callback after successful submission */
  onSubmitSuccess?: () => void;
  /** Optional custom class */
  className?: string;
}

/**
 * Forgot password form component with client-side validation,
 * accessible error handling, and uniform confirmation messaging.
 */
export function ForgotPasswordForm({ onSubmitSuccess, className }: ForgotPasswordFormProps) {
  const [email, setEmail] = React.useState('');
  const [errors, setErrors] = React.useState<FormErrors>({ email: null });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const emailRef = React.useRef<HTMLInputElement>(null);

  /* -- Client-side validation on submit -- */

  function validateAll(): boolean {
    const newErrors: FormErrors = {
      email: validateEmail(email),
    };
    setErrors(newErrors);

    if (newErrors.email) {
      emailRef.current?.focus();
    }

    return !newErrors.email;
  }

  /* -- Single-field blur validation -- */

  function handleEmailBlur() {
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }

  /* -- Submit handler -- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateAll()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
        }),
      });

      // Always treat as success — the API returns 200 regardless of whether
      // the user exists (prevents account enumeration)
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const errorObj = errorBody && typeof errorBody === 'object' && 'error' in errorBody
          ? (errorBody as { error?: { message?: string } })
          : null;
        setServerError(
          errorObj?.error?.message || 'An error occurred. Please try again later.'
        );
        return;
      }

      // Show confirmation message
      setSubmitted(true);
      onSubmitSuccess?.();
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  /* -- Submit button label -- */

  const submitLabel = loading ? 'Sending...' : 'Send Reset Link';

  /* -- If submitted, show confirmation -- */

  if (submitted) {
    return (
      <div className={cn('flex flex-col gap-5 w-full max-w-md mx-auto', className)}>
        <div
          role="status"
          aria-live="polite"
          data-testid="forgot-password-success-banner"
          className="rounded-md bg-green-500/15 p-4 text-sm text-green-600 border border-green-500/30"
        >
          <h2 className="font-semibold mb-1">Check your email</h2>
          <p className="text-muted-foreground">
            If an account exists for that email, a password reset link has been sent.
            Please check your inbox and spam folder.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  /* -- Render the form -- */

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn('flex flex-col gap-5 w-full max-w-md mx-auto', className)}
    >
      {/* Server error alert banner */}
      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="forgot-password-error-banner"
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
        >
          {serverError}
        </div>
      )}

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="forgot-password-email"
          className="text-sm font-medium text-foreground"
        >
          Email
        </label>
        <Input
          id="forgot-password-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          ref={emailRef}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'forgot-password-email-error' : undefined}
          className={cn(errors.email && 'border-destructive')}
          autoComplete="email"
        />
        {errors.email && (
          <p
            id="forgot-password-email-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.email}
          </p>
        )}
      </div>

      {/* Submit button */}
      <Button
        type="submit"
        variant="default"
        disabled={loading}
        aria-disabled={loading}
        className="w-full"
      >
        {loading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {submitLabel}
      </Button>

      {/* Links for navigation */}
      <div className="flex flex-col gap-2 text-sm text-center">
        <a
          href="/login"
          className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
        >
          Back to Sign In
        </a>
      </div>
    </form>
  );
}
