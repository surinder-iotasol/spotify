/**
 * Dashboard Page (STORY-track-006a)
 *
 * Main dashboard landing with a navigation link to upload.
 */

import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-4">Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        Manage your tracks and upload new music.
      </p>
      <div>
        <Link
          href="/dashboard/upload"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Upload a Track
        </Link>
      </div>
    </div>
  );
}
