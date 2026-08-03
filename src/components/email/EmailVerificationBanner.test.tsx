/**
 * STORY-role-006: Unit tests for the EmailVerificationBanner component.
 *
 * Verifies:
 * - Banner is hidden when emailVerified is true
 * - Banner displays when emailVerified is false
 * - Resend button is present and callable when onResend is provided
 * - Dismiss button is present and callable when dismissible is true
 * - Custom resend label is respected
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EmailVerificationBanner } from './EmailVerificationBanner';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/*  Visibility tests                                                   */
/* ------------------------------------------------------------------ */

describe('EmailVerificationBanner: Visibility', () => {
  it('renders when emailVerified is false', () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it('does not render when emailVerified is true', () => {
    const { container } = render(<EmailVerificationBanner emailVerified={true} />);
    expect(container.firstChild).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Resend button tests                                                */
/* ------------------------------------------------------------------ */

describe('EmailVerificationBanner: Resend button', () => {
  it('shows resend button when onResend is provided', () => {
    render(<EmailVerificationBanner emailVerified={false} onResend={() => {}} />);
    expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument();
  });

  it('does not show resend button when onResend is not provided', () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.queryByRole('button', { name: /resend verification email/i })).not.toBeInTheDocument();
  });

  it('calls onResend when resend button is clicked', () => {
    const onResend = vi.fn();
    render(<EmailVerificationBanner emailVerified={false} onResend={onResend} />);
    fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('renders custom resend label when provided', () => {
    render(
      <EmailVerificationBanner
        emailVerified={false}
        onResend={() => {}}
        resendLabel="Send me a new email"
      />,
    );
    expect(screen.getByRole('button', { name: /send me a new email/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Dismissible tests                                                  */
/* ------------------------------------------------------------------ */

describe('EmailVerificationBanner: Dismissible', () => {
  it('shows dismiss button when dismissible is true', () => {
    render(<EmailVerificationBanner emailVerified={false} dismissible />);
    expect(screen.getByLabelText(/dismiss notification/i)).toBeInTheDocument();
  });

  it('does not show dismiss button when dismissible is false', () => {
    render(<EmailVerificationBanner emailVerified={false} dismissible={false} />);
    expect(
      screen.queryByLabelText(/dismiss notification/i),
    ).not.toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<EmailVerificationBanner emailVerified={false} dismissible onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText(/dismiss notification/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
