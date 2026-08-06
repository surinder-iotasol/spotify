/**
 * Dashboard Layout
 *
 * Provides a consistent layout for all dashboard pages with header space
 * and a main content area.
 */

export const metadata = {
  title: 'Dashboard - spotify',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
