/**
 * STORY-auth-006: Client-side registration form component.
 *
 * Features:
 * - Zod-like client-side validation matching server schema
 * - Password strength meter (weak / fair / strong)
 * - Show/hide password toggle
 * - Accessible loading states with aria-disabled
 * - Server error banner (role="alert")
 * - Focus management on validation errors per WCAG 2.1 AA
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Validation helpers — mirror server registrationSchema              */
/* ------------------------------------------------------------------ */

interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

const passwordRules: ValidationRule[] = [
  { test: (v) => v.length >= 8, message: 'Password must be at least 8 characters' },
  { test: (v) => /[A-Z]/.test(v), message: 'Password must contain at least one uppercase letter' },
  { test: (v) => /[a-z]/.test(v), message: 'Password must contain at least one lowercase letter' },
  { test: (v) => /[0-9]/.test(v), message: 'Password must contain at least one digit' },
];

function validateEmail(value: string): string | null {
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Email must be a valid email address';
  }
  return null;
}

function validateDisplayName(value: string): string | null {
  if (!value || !value.trim()) {
    return 'Display name is required';
  }
  if (value.trim().length > 80) {
    return 'Display name must be at most 80 characters';
  }
  return null;
}

function getPasswordStrength(password: string): 'weak' | 'fair' | 'strong' | null {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  if (score <= 1) return 'weak';
  if (score <= 2) return 'fair';
  return 'strong';
}

function getPasswordStrengthColor(strength: string): string {
  switch (strength) {
    case 'weak': return 'bg-red-500';
    case 'fair': return 'bg-yellow-500';
    case 'strong': return 'bg-green-500';
    default: return 'bg-gray-600';
  }
}

/* ------------------------------------------------------------------ */
/*  Form fields ref types                                             */
/* ------------------------------------------------------------------ */

interface FormErrors {
  email: string | null;
  password: string | null;
  displayName: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                   */
/* ------------------------------------------------------------------ */

interface RegisterFormProps {
  onSubmit?: (data: { email: string; password: string; displayName: string }) => void;
  className?: string;
}

/**
 * Registration form component with client-side validation, password strength
 * meter, show/hide toggle, and accessible error handling.
 */
export function RegisterForm({ onSubmit, className }: RegisterFormProps) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({
    email: null,
    password: null,
    displayName: null,
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const displayNameRef = React.useRef<HTMLInputElement>(null);

  const passwordStrength = getPasswordStrength(password);

  /* -- Client-side validation on submit -- */

  function validateAll(): boolean {
    const newErrors: FormErrors = {
      email: validateEmail(email),
      password:
        password.length > 0
          ? passwordRules.find((r) => !r.test(password))?.message ?? null
          : 'Password must be at least 8 characters',
      displayName: validateDisplayName(displayName),
    };
    setErrors(newErrors);

    // Focus first invalid field (WCAG 2.1 AA)
    if (newErrors.email) {
      emailRef.current?.focus();
    } else if (newErrors.password) {
      passwordRef.current?.focus();
    } else if (newErrors.displayName) {
      displayNameRef.current?.focus();
    }

    return !newErrors.email && !newErrors.password && !newErrors.displayName;
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
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          password,
          displayName: displayName.trim(),
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        const errorObj = errorBody && typeof errorBody === 'object' && 'error' in errorBody ? (errorBody as { error?: { message?: string; code?: string } }) : null;
        const message = errorObj?.error?.message ||
          (typeof errorBody === 'string' ? errorBody : 'Registration failed. Please try again.');
        const code = errorObj?.error?.code ?? undefined;
        setServerError(message);

        // If server says email exists, focus email
        if (code === 'AUTH_EMAIL_EXISTS') {
          emailRef.current?.focus();
        }
        return;
      }

      // Success — consume the response body and call onSubmit if provided
      await res.json();
      onSubmit?.({ email: email.toLowerCase(), password, displayName: displayName.trim() });
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  /* -- Submit button label -- */

  const submitLabel = loading ? 'Creating Account...' : 'Create Account';

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
          data-testid="register-error-banner"
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
        >
          {serverError}
        </div>
      )}

      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="register-email"
          className="text-sm font-medium text-foreground"
        >
          Email
        </label>
        <Input
          id="register-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={handleEmailBlur}
          ref={emailRef}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={cn(errors.email && 'border-destructive')}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-destructive" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="register-password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Min 8 chars, 1 uppercase, 1 lowercase, 1 digit"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ref={passwordRef}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
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
          <p id="password-error" className="text-xs text-destructive" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      {/* Password strength meter */}
      {password && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Password strength</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  getPasswordStrengthColor(passwordStrength || 'weak')
                )}
                style={{
                  width:
                    passwordStrength === 'weak'
                      ? '33%'
                      : passwordStrength === 'fair'
                        ? '66%'
                        : '100%',
                }}
              />
            </div>
            <span className="text-xs font-medium capitalize text-foreground">
              {passwordStrength}
            </span>
          </div>
        </div>
      )}

      {/* Display name field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="register-display-name"
          className="text-sm font-medium text-foreground"
        >
          Display Name
        </label>
        <Input
          id="register-display-name"
          name="displayName"
          type="text"
          placeholder="Your display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          ref={displayNameRef}
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'displayName-error' : undefined}
          className={cn(errors.displayName && 'border-destructive')}
        />
        {errors.displayName && (
          <p
            id="displayName-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.displayName}
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
