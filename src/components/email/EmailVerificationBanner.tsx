/**
 * STORY-role-006: Persistent email verification notification banner.
 *
 * Displays a sticky banner when the user's email is not yet verified,
 * explaining the upload gating restriction per DEC-004.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EmailVerificationBannerProps {
  emailVerified: boolean;
  onResend?: () => void;
  resendLabel?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Banner component                                                   */
/* ------------------------------------------------------------------ */

export function EmailVerificationBanner({
  emailVerified,
  onResend,
  resendLabel = 'Resend Verification Email',
  dismissible = false,
  onDismiss,
}: EmailVerificationBannerProps) {
  // Don't render if email is already verified
  if (emailVerified) {
    return null;
  }

  const handleResend = () => {
    if (onResend) {
      onResend();
    }
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      className="flex items-center gap-3 border-b bg-amber-50 px-4 py-3 text-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900"
      role="alert"
      aria-live="polite"
    >
      <svg
        className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="flex-1 text-sm">
        <strong>Verify your email</strong> to unlock uploads and publishing features.
      </p>
      {onResend && (
        <button
          type="button"
          onClick={handleResend}
          className="flex-shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
        >
          {resendLabel}
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          aria-label="Dismiss notification"
        >
          <svg
            className="h-4 w-4"
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
        </button>
      )}
    </div>
  );
}

export default EmailVerificationBanner;
