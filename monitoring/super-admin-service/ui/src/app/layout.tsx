import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Simplify Projects - Super Admin Console',
  description: 'Monitoring and administration dashboard for Simplify Projects platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="orbis">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}