import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Magazzino Edile – Prelievi",
  description: "Gestione prelievi tra magazzino e ufficio",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
    // opzionale:
    // shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Magazzino Edile – Prelievi",
    description: "Gestione prelievi tra magazzino e ufficio",
    // qui NON mettere icons
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
