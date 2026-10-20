import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TicketForge | Events',
  description:
    'A high-concurrency ticketing platform built to learn reliable backend engineering.',
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
