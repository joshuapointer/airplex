import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'airplex',
  description: 'Plex share-link service',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-np-bg text-np-fg font-mono min-h-screen">{children}</body>
    </html>
  );
}
