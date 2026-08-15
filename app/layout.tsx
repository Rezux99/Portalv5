import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EDGAR/EXTRACT — SEC Filing Terminal',
  description:
    'Real-time SEC EDGAR extraction terminal. Live filing tape, full-text search, XBRL company facts, insider transactions and one-click JSON/CSV export.',
  generator: 'v0.app',
  keywords: [
    'SEC EDGAR',
    'XBRL',
    'company facts',
    'full-text search',
    '13F',
    'Form 4',
    'financial data extraction',
  ],
  openGraph: {
    title: 'EDGAR/EXTRACT — SEC Filing Terminal',
    description:
      'Real-time SEC EDGAR extraction: live tape, full-text search, XBRL facts, exports.',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#141a22',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
