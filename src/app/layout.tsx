export const metadata = {
  title: 'spotify',
  description: 'Spotify-inspired music streaming platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
