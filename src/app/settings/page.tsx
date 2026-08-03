/**
 * STORY-role-005: Account Settings page.
 *
 * Renders the ArtistUpgradeForm component within the account settings section.
 */
import { ArtistUpgradeForm } from '@/components/ArtistUpgradeForm';

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Account Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your account and upgrade to an artist
          </p>
        </div>
        <div className="border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Upgrade to Artist
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Transition your account from Listener to Artist. You can upload music,
            create playlists, and grow your fan base.
          </p>
          <ArtistUpgradeForm />
        </div>
      </div>
    </div>
  );
}
