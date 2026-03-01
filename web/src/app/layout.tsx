import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/auth/AuthProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CreditOdds Social',
  description: 'Social media posting dashboard for CreditOdds',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <AuthProvider>
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

function NavBar() {
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <a href="/" className="text-xl font-bold text-indigo-600">
              CreditOdds Social
            </a>
            <div className="hidden sm:flex space-x-4">
              <a href="/" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
                Queue
              </a>
              <a href="/compose" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
                Compose
              </a>
              <a href="/history" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
                History
              </a>
              <a href="/accounts" className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium">
                Accounts
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
