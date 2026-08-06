/**
 * Dashboard Upload Page (STORY-track-006a)
 *
 * Minimal page shell for the dashboard upload route.
 * Includes correct page title, header space from layout, and content area.
 */

export const metadata = {
  title: 'Upload a Track - Dashboard',
};

export default function DashboardUploadPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-4">Upload a Track</h1>
      <p className="text-muted-foreground mb-6">
        This is the upload page shell. The track upload wizard will be added in subsequent stories.
      </p>
      <div className="rounded-lg border p-6 bg-card text-card-foreground min-h-[200px]">
        <p className="text-sm">Content area ready for upload form.</p>
      </div>
    </div>
  );
}
