import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TicketForge | Find your next good night',
  description:
    'Explore upcoming experiences, make free event bookings, and keep your plans in one place. Fictional cinema preview also available.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
