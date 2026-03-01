import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/auth/AuthProvider';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'CreditOdds Social',
  description: 'Social media posting dashboard for CreditOdds',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen flex flex-col" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        <AuthProvider>
          <NavBar />
          <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
