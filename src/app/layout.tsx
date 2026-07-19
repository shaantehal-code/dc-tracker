import type { Metadata, Viewport } from 'next';
import './globals.css';

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%232563eb'/%3E%3Ctext x='50' y='69' font-size='52' font-family='system-ui,sans-serif' font-weight='700' text-anchor='middle' fill='white'%3EDC%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: 'DC Tracker — Data Center Site Intelligence',
  description:
    'Global data center site-acquisition intelligence: 100+ tracked sites, real-time market signals, grid feasibility, operator intelligence, and AI-powered analysis.',
  keywords: [
    'data center', 'site acquisition', 'hyperscale', 'interconnection queue',
    'grid feasibility', 'power markets', 'AI infrastructure', 'colocation',
  ],
  applicationName: 'DC Tracker',
  icons: { icon: FAVICON, shortcut: FAVICON, apple: FAVICON },
  openGraph: {
    title: 'DC Tracker — Data Center Site Intelligence',
    description:
      'Global data center site-acquisition intelligence with real-time market signals, grid feasibility, and AI analysis.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
