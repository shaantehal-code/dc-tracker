import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DC Tracker — Data Center Intelligence',
  description: 'Global data center site acquisition intelligence platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
