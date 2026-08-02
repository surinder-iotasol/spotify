/**
 * STORY-auth-008: Client-side reset-password form component.
 *
 * Features:
 * - Extracts reset token from URL query params
 * - Password strength validation before submitting (min 8 chars, uppercase, lowercase, digit)
 * - Password confirmation field
 * - Visual feedback banner on successful reset
 * - Accessible loading states with aria-disabled
 * - Server error banner (role="alert")
 * - Links to sign in on success
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Password strength validation                                       */
/* ------------------------------------------------------------------ */

interface PasswordStrengthResult {
  score: number;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigit: boolean;
}

/**
 * Evaluate password against strength rules required by the API schema.
 * Returns a score (0-4) and individual checks.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  return {
    score: [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
    ].filter(Boolean).length,
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
  };
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateNewPassword(value: string): string | null {
  const strength = evaluatePasswordStrength(value);
  if (!strength.hasMinLength) {
    return 'Password must be at least 8 characters';
  }
  if (!strength.hasUppercase) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!strength.hasLowercase) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!strength.hasDigit) {
    return 'Password must contain at least one digit';
  }
  return null;
}

function validatePasswordConfirm(newPassword: string, confirm: string): string | null {
  if (!confirm) {
    return 'Please confirm your password';
  }
  if (newPassword !== confirm) {
    return 'Passwords do not match';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Form state types                                                   */
/* ------------------------------------------------------------------ */

interface FormErrors {
  newPassword: string | null;
  confirmPassword: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                    */
/* ------------------------------------------------------------------ */

interface ResetPasswordFormProps {
  /** Reset token from URL query params (optional when provided externally) */
  token?: string;
  /** Optional custom class */
  className?: string;
}

/**
 * Reset password form component with strength validation, accessible
 * error handling, and success confirmation with sign-in link.
 */
export function ResetPasswordForm({ token, className }: ResetPasswordFormProps) {
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [errors, setErrors] = React.useState<FormErrors>({
    newPassword: null,
    confirmPassword: null,
  });
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);

  /* -- Client-side validation on submit -- */

  function validateAll(): boolean {
    const newErrors: FormErrors = {
      newPassword: validateNewPassword(newPassword),
      confirmPassword: validatePasswordConfirm(newPassword, confirmPassword),
    };
    setErrors(newErrors);

    // Focus first invalid field (WCAG 2.1 AA)
    if (newErrors.newPassword) {
      passwordRef.current?.focus();
    } else if (newErrors.confirmPassword) {
      confirmRef.current?.focus();
    }

    return !newErrors.newPassword && !newErrors.confirmPassword;
  }

  /* -- Single-field blur validation -- */

  function handleNewPasswordBlur() {
    setErrors((prev) => ({ ...prev, newPassword: validateNewPassword(newPassword) }));
  }

  function handleConfirmPasswordBlur() {
    setErrors((prev) => ({
      ...prev,
      confirmPassword: validatePasswordConfirm(newPassword, confirmPassword),
    }));
  }

  /* -- Submit handler -- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateAll()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token || '',
          newPassword,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const errorObj = errorBody && typeof errorBody === 'object' && 'error' in errorBody
          ? (errorBody as { error?: { message?: string; code?: string } })
          : null;
        const message = errorObj?.error?.message || 'Reset failed. Please try again.';
        const code = errorObj?.error?.code ?? undefined;

        // Show token-specific errors
        if (code === 'INVALID_TOKEN') {
          setServerError('Invalid or missing password reset token.');
        } else if (code === 'TOKEN_EXPIRED') {
          setServerError('This password reset link has expired. Please request a new one.');
        } else {
          setServerError(message);
        }
        return;
      }

      // Success — show confirmation
      setSuccess(true);
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  /* -- Submit button label -- */

  const submitLabel = loading ? 'Resetting...' : 'Reset Password';

  /* -- Password strength indicator -- */

  const strength = evaluatePasswordStrength(newPassword);
  const strengthLabel = strength.score === 0 ? ''
    : strength.score <= 1 ? 'Weak'
    : strength.score <= 2 ? 'Fair'
    : strength.score <= 3 ? 'Good'
    : 'Strong';

  const strengthColor = strength.score <= 1 ? 'text-red-500'
    : strength.score <= 2 ? 'text-yellow-500'
    : strength.score <= 3 ? 'text-blue-500'
    : 'text-green-500';

  /* -- If successful, show confirmation -- */

  if (success) {
    return (
      <div className={cn('flex flex-col gap-5 w-full max-w-md mx-auto', className)}>
        <div
          role="status"
          aria-live="polite"
          data-testid="reset-password-success-banner"
          className="rounded-md bg-green-500/15 p-4 text-sm text-green-600 border border-green-500/30"
        >
          <h2 className="font-semibold mb-1">Password reset successful</h2>
          <p className="text-muted-foreground">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
        </div>
        <a
          href="/login"
          className="inline-block w-full text-center text-sm text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
        >
          Sign In
        </a>
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
          data-testid="reset-password-error-banner"
          className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30"
        >
          {serverError}
        </div>
      )}

      {/* New password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reset-password-new"
          className="text-sm font-medium text-foreground"
        >
          New Password
        </label>
        <div className="relative">
          <Input
            id="reset-password-new"
            name="newPassword"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={handleNewPasswordBlur}
            ref={passwordRef}
            aria-invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? 'reset-password-new-error' : undefined}
            className={cn(errors.newPassword && 'border-destructive', 'pr-10')}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById('reset-password-new') as HTMLInputElement;
              if (input) {
                const isText = input.type === 'text';
                input.type = isText ? 'password' : 'text';
              }
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle password visibility"
            data-testid="reset-password-toggle"
          >
            {/* Eye icon (default — toggled via JS) */}
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
          </button>
        </div>
        {/* Password strength indicator */}
        {newPassword && (
          <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
            <span className={cn('font-medium', strengthColor)}>
              {strengthLabel}
            </span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={cn(
                    'h-1 w-4 rounded-full',
                    strength.score >= level
                      ? strength.score <= 1 ? 'bg-red-500'
                      : strength.score <= 2 ? 'bg-yellow-500'
                      : strength.score <= 3 ? 'bg-blue-500'
                      : 'bg-green-500'
                      : 'bg-gray-300'
                  )}
                />
              ))}
            </div>
          </div>
        )}
        {/* Password requirements checklist */}
        {newPassword && (
          <ul className="text-xs text-muted-foreground space-y-0.5" aria-live="polite">
            <li className={cn(strength.hasMinLength ? 'text-green-600' : '')}>
              {strength.hasMinLength ? '✓' : '○'} At least 8 characters
            </li>
            <li className={cn(strength.hasUppercase ? 'text-green-600' : '')}>
              {strength.hasUppercase ? '✓' : '○'} One uppercase letter
            </li>
            <li className={cn(strength.hasLowercase ? 'text-green-600' : '')}>
              {strength.hasLowercase ? '✓' : '○'} One lowercase letter
            </li>
            <li className={cn(strength.hasDigit ? 'text-green-600' : '')}>
              {strength.hasDigit ? '✓' : '○'} One digit
            </li>
          </ul>
        )}
        {errors.newPassword && (
          <p
            id="reset-password-new-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.newPassword}
          </p>
        )}
      </div>

      {/* Confirm password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reset-password-confirm"
          className="text-sm font-medium text-foreground"
        >
          Confirm Password
        </label>
        <Input
          id="reset-password-confirm"
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={handleConfirmPasswordBlur}
          ref={confirmRef}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'reset-password-confirm-error' : undefined}
          className={cn(errors.confirmPassword && 'border-destructive')}
          autoComplete="new-password"
        />
        {errors.confirmPassword && (
          <p
            id="reset-password-confirm-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {errors.confirmPassword}
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
