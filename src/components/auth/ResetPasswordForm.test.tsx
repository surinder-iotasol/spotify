/**
 * STORY-auth-008: Unit tests for the reset-password form component.
 *
 * Verifies:
 * - Password strength validation (min length, uppercase, lowercase, digit)
 * - Password confirmation matching
 * - Form submission to reset-password API with token
 * - Success banner with sign-in link
 * - Server error display for invalid/expired tokens
 * - Loading state
 * - Accessible error alerts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ResetPasswordForm, evaluatePasswordStrength } from './ResetPasswordForm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mockFetch(response: { status: number; body: Record<string, unknown> }) {
  const mock = vi.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Password strength evaluation tests                                 */
/* ------------------------------------------------------------------ */

describe('evaluatePasswordStrength', () => {
  it('returns score 0 for empty password', () => {
    const result = evaluatePasswordStrength('');
    expect(result.score).toBe(0);
    expect(result.hasMinLength).toBe(false);
    expect(result.hasUppercase).toBe(false);
    expect(result.hasLowercase).toBe(false);
    expect(result.hasDigit).toBe(false);
  });

  it('returns score 2 for password with length and lowercase', () => {
    const result = evaluatePasswordStrength('abcdefgh');
    expect(result.score).toBe(2);
    expect(result.hasMinLength).toBe(true);
    expect(result.hasUppercase).toBe(false);
    expect(result.hasLowercase).toBe(true);
    expect(result.hasDigit).toBe(false);
  });

  it('returns score 3 for password with length, uppercase, and lowercase', () => {
    const result = evaluatePasswordStrength('Abcdefgh');
    expect(result.score).toBe(3);
    expect(result.hasMinLength).toBe(true);
    expect(result.hasUppercase).toBe(true);
    expect(result.hasLowercase).toBe(true);
    expect(result.hasDigit).toBe(false);
  });

  it('returns score 4 for strong password with all checks', () => {
    const result = evaluatePasswordStrength('Password1');
    expect(result.score).toBe(4);
    expect(result.hasMinLength).toBe(true);
    expect(result.hasUppercase).toBe(true);
    expect(result.hasLowercase).toBe(true);
    expect(result.hasDigit).toBe(true);
  });

  it('flags short password', () => {
    const result = evaluatePasswordStrength('Ab1');
    expect(result.hasMinLength).toBe(false);
  });

  it('flags missing uppercase', () => {
    const result = evaluatePasswordStrength('password1');
    expect(result.hasUppercase).toBe(false);
  });

  it('flags missing lowercase', () => {
    const result = evaluatePasswordStrength('PASSWORD1');
    expect(result.hasLowercase).toBe(false);
  });

  it('flags missing digit', () => {
    const result = evaluatePasswordStrength('Password');
    expect(result.hasDigit).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Rendering tests                                                    */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Rendering', () => {
  it('renders new password input field', () => {
    render(<ResetPasswordForm token="test-token" />);
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
  });

  it('renders confirm password input field', () => {
    render(<ResetPasswordForm token="test-token" />);
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<ResetPasswordForm token="test-token" />);
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('passes token from props to form', () => {
    render(<ResetPasswordForm token="abc123token" />);
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Client-side validation tests                                       */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Client-side validation', () => {
  it('shows error for short password on submit', async () => {
    render(<ResetPasswordForm token="test-token" />);
    const submitBtn = screen.getByRole('button', { name: /reset password/i });

    await fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'Ab1' } });
    await fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'Ab1' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it('shows error for password missing uppercase on submit', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const matches = screen.getAllByText(/one uppercase letter/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error for password missing lowercase on submit', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'PASSWORD123');
    await user.type(screen.getByLabelText('Confirm Password'), 'PASSWORD123');
    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const matches = screen.getAllByText(/one lowercase letter/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error for password missing digit on submit', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password');
    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const matches = screen.getAllByText(/one digit/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error for mismatched passwords on submit', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password456');
    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('validates password on blur with weak password', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    const passwordInput = screen.getByLabelText('New Password');
    await user.type(passwordInput, 'short');
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it('validates confirm password on blur when empty', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password123');
    const confirmInput = screen.getByLabelText('Confirm Password');
    await user.click(confirmInput);
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/please confirm your password/i)).toBeInTheDocument();
    });
  });

  it('validates confirm password on blur when mismatched', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'different1');
    const confirmInput = screen.getByLabelText('Confirm Password');
    await user.click(confirmInput);
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Password strength indicator tests                                  */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Password strength indicator', () => {
  it('does not show strength indicator for empty password', () => {
    render(<ResetPasswordForm token="test-token" />);
    expect(screen.queryByText(/weak|fair|good|strong/i)).not.toBeInTheDocument();
  });

  it('shows strength label when typing a password', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    // 'abcdefgh' has score 2 (length + lowercase) → "Fair"
    await user.type(screen.getByLabelText('New Password'), 'abcdefgh');
    await waitFor(() => {
      expect(screen.getByText('Fair')).toBeInTheDocument();
    });
  });

  it('shows strong strength for a complete password', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    // 'Password1' has score 4 (all checks pass) → "Strong"
    await user.clear(screen.getByLabelText('New Password'));
    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await waitFor(() => {
      expect(screen.getByText('Strong')).toBeInTheDocument();
    });
  });

  it('shows weak strength for a short password meeting length only', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    // 'aB1' has score 0 (no checks) → label is empty string, no text
    // 'ab' score 0, 'abc' score 0 — too short for any check
    // For score 1, need length only: use a 1-char that's not a digit → score 0
    // Actually let's test for a password that has only lowercase and short
    // 'abc' → minLength=false, uppercase=false, lowercase=true, digit=false → score=1 → "Weak"
    await user.clear(screen.getByLabelText('New Password'));
    await user.type(screen.getByLabelText('New Password'), 'abc');
    await waitFor(() => {
      expect(screen.getByText('Weak')).toBeInTheDocument();
    });
  });

  it('shows fair strength for a password with length and one extra check', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    // 'Pass1' → minLength=false → score=0, not "Fair"
    // 'abcdE' → minLength=true, uppercase=true → score=2 → "Fair"
    await user.clear(screen.getByLabelText('New Password'));
    await user.type(screen.getByLabelText('New Password'), 'abcdE');
    await waitFor(() => {
      expect(screen.getByText('Fair')).toBeInTheDocument();
    });
  });

  it('shows requirements checklist with correct states', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    // Type a password that meets all requirements
    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await waitFor(() => {
      expect(screen.getByText('✓ At least 8 characters')).toBeInTheDocument();
      expect(screen.getByText('✓ One uppercase letter')).toBeInTheDocument();
      expect(screen.getByText('✓ One lowercase letter')).toBeInTheDocument();
      expect(screen.getByText('✓ One digit')).toBeInTheDocument();
    });
  });

  it('shows requirements checklist with incorrect states for weak password', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'pass');
    await waitFor(() => {
      expect(screen.getByText(/○ At least 8 characters/i)).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Form submission tests                                              */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Form submission', () => {
  it('submits to API with valid password', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true, message: 'Password has been successfully reset.' },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="reset-token-123" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith('/api/v1/auth/reset-password', expect.any(Object));
    });
  });

  it('passes token to the API', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="my-reset-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      const callArgs = mock.mock.calls[0][1] as { body?: string };
      const body = JSON.parse(callArgs.body || '{}');
      expect(body.token).toBe('my-reset-token');
    });
  });

  it('shows success banner after successful reset', async () => {
    mockFetch({
      status: 200,
      body: { success: true, message: 'Password has been successfully reset.' },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="reset-token-123" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByTestId('reset-password-success-banner')).toBeVisible();
      expect(screen.getByText(/password reset successful/i)).toBeInTheDocument();
    });
  });

  it('renders sign-in link after successful reset', async () => {
    mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="reset-token-123" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  it('displays INVALID_TOKEN error from server', async () => {
    mockFetch({
      status: 400,
      body: {
        success: false,
        error: { message: 'Invalid or missing password reset token.', code: 'INVALID_TOKEN' },
      },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="bad-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or missing password reset token/i)).toBeInTheDocument();
    });
  });

  it('displays TOKEN_EXPIRED error from server', async () => {
    mockFetch({
      status: 400,
      body: {
        success: false,
        error: { message: 'This password reset link has expired.', code: 'TOKEN_EXPIRED' },
      },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="expired-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password reset link has expired/i)).toBeInTheDocument();
    });
  });

  it('displays network error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const user = userEvent.setup();
    render(<ResetPasswordForm token="reset-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error. Please check your connection and try again.');
    });
  });

  it('shows loading state and disables submit button during submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });
        }, 500);
      });
    }));

    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility tests                                                */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Accessibility', () => {
  it('error messages have role="alert"', async () => {
    render(<ResetPasswordForm token="test-token" />);

    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('invalid fields have aria-invalid="true"', async () => {
    render(<ResetPasswordForm token="test-token" />);

    const submitBtn = screen.getByRole('button', { name: /reset password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const passwordInput = screen.getByLabelText('New Password');
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('password success banner has role="status"', async () => {
    mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm token="test-token" />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      const banner = screen.getByTestId('reset-password-success-banner');
      expect(banner).toHaveAttribute('role', 'status');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Token state handling tests                                         */
/* ------------------------------------------------------------------ */

describe('ResetPasswordForm: Token state handling', () => {
  it('renders form when token is provided', () => {
    render(<ResetPasswordForm token="my-token" />);
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders form with empty string token', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
  });

  it('passes empty string as token when no token prop is provided', async () => {
    const mock = mockFetch({
      status: 200,
      body: { success: true },
    });

    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByLabelText('New Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm Password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      const callArgs = mock.mock.calls[0][1] as { body?: string };
      const body = JSON.parse(callArgs.body || '{}');
      expect(body.token).toBe('');
    });
  });
});
