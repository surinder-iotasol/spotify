/**
 * STORY-auth-007: /login page — renders the login form
 * with dark-mode design tokens and responsive layout.
 *
 * Handles guest session migration: if guest playlists exist in
 * localStorage after successful login, triggers migration via
 * sessionStorage flag for the parent application to consume.
 */
'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import {
  GUEST_PLAYLISTS_KEY,
  extractGuestPlaylists,
  type GuestPlaylist,
} from '@/lib/auth/guest-session';

/** Key used to signal guest migration in sessionStorage. */
const GUEST_MIGRATION_PENDING_KEY = 'guest_migration_pending';

/**
 * Trigger guest session migration by persisting the guest playlist count
 * in sessionStorage so the parent app (e.g., sidebar or redirect handler)
 * can pick it up and call the migration API.
 */
function triggerGuestMigration(): void {
  if (typeof window === 'undefined') return;

  const guestPlaylists = extractGuestPlaylists();
  if (guestPlaylists.length > 0) {
    // Store the count so parent knows migration is pending
    sessionStorage.setItem(
      GUEST_MIGRATION_PENDING_KEY,
      String(guestPlaylists.length),
    );
  }
}

export default function LoginPage() {
  const [migrationTriggered, setMigrationTriggered] = useState(false);

  const handleLoginSuccess = useCallback(() => {
    if (!migrationTriggered) {
      triggerGuestMigration();
      setMigrationTriggered(true);
    }
  }, [migrationTriggered]);

  // Clear migration flag on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(GUEST_MIGRATION_PENDING_KEY);
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>
        <LoginForm onSubmit={handleLoginSuccess} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
