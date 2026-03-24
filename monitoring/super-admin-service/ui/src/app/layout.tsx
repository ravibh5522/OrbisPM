import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OrbisPM - Super Admin Console',
  description: 'Monitoring and administration dashboard for OrbisPM platform',
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