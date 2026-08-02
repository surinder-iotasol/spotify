/**
 * STORY-auth-007: Client-side login form component.
 *
 * Features:
 * - Email + password fields with client-side validation
 * - Password visibility toggle (show/hide)
 * - Accessible loading states with aria-disabled
 * - Server error banner (role="alert")
 * - Focus management on validation errors per WCAG 2.1 AA
 * - Guest session migration trigger callback on successful login
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

function validatePassword(value: string): string | null {
  if (!value) {
    return 'Password is required';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Form fields ref types                                             */
/* ------------------------------------------------------------------ */

interface FormErrors {
  email: string | null;
  password: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                   */
/* ------------------------------------------------------------------ */

interface LoginFormProps {
  /** Called after successful login with the migrated guest data (if any). */
  onSubmit?: (guestMigrationAvailable: boolean) => void;
  /** Optional custom class. */
  className?: string;
}

/**
 * Login form component with client-side validation, password visibility
 * toggle, and accessible error handling.
 */
export function LoginForm({ onSubmit, className }: LoginFormProps) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({
    email: null,
    password: null,
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  /* -- Client-side validation on submit -- */

  function validateAll(): boolean {
    const newErrors: FormErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(newErrors);

    // Focus first invalid field (WCAG 2.1 AA)
    if (newErrors.email) {
      emailRef.current?.focus();
    } else if (newErrors.password) {
      passwordRef.current?.focus();
    }

    return !newErrors.email && !newErrors.password;
  }

  /* -- Single-field blur validation -- */

  function handleEmailBlur() {
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }

  function handlePasswordBlur() {
    setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
  }

  /* -- Submit handler -- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateAll()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          password,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const errorObj = errorBody && typeof errorBody === 'object' && 'error' in errorBody ? (errorBody as { error?: { message?: string; code?: string } }) : null;
        const message = errorObj?.error?.message ||
          (typeof errorBody === 'string' ? errorBody : 'Login failed. Please try again.');
        const code = errorObj?.error?.code ?? undefined;
        setServerError(message);

        // If server says invalid credentials, focus email for retry
        if (code === 'INVALID_CREDENTIALS') {
          emailRef.current?.focus();
        }
        return;
      }

      // Success — consume the response body and call onSubmit if provided
      await res.json();
      onSubmit?.(false);
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  /* -- Submit button label -- */

  const submitLabel = loading ? 'Signing in...' : 'Sign In';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn('flex flex-col gap-5 w-full max-w-md mx-auto', className)}
    >
      {/* Server error alert banner — accessible */}
      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid="login-error-banner"
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
        >
          {serverError}
        </div>
      )}

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-email"
          className="text-sm font-medium text-foreground"
        >
          Email
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          ref={emailRef}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          className={cn(errors.email && 'border-destructive')}
        />
        {errors.email && (
          <p id="login-email-error" className="text-xs text-destructive" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={handlePasswordBlur}
            ref={passwordRef}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            className={cn(
              errors.password && 'border-destructive',
              'pr-10'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            data-testid="password-toggle"
          >
            {showPassword ? (
              /* Eye-off icon */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.91 2.95" />
                <path d="M1 1l22 22" />
                <path d="M2.06 2.06a13.15 13.15 0 0 1 7.07-1.07C16 4 19 11 19 11c-.1.22-.21.43-.33.64" />
                <path d="M13.82 18.15A8.96 8.96 0 0 1 12 19c-7 0-10-7-10-7 .72-1.6 1.84-3.06 3.26-4.28" />
              </svg>
            ) : (
              /* Eye icon */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 11.599 11.599 0 0 1 1.948-2.836l1.46-1.46a1 1 0 0 1 1.12-.204l1.672.668" />
                <circle cx="12" cy="12" r="3" />
                <path d="M21.938 11.652a1 1 0 0 1 0 .696 11.599 11.599 0 0 1-1.948 2.836l-1.46 1.46a1 1 0 0 1-1.12.204l-1.672-.668" />
                <path d="M1 1l22 22" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && (
          <p id="login-password-error" className="text-xs text-destructive" role="alert">
            {errors.password}
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
    </form>
  );
}
