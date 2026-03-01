'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getAccounts, updateAccount, SocialAccount } from '@/lib/api';
import PlatformBadge from '@/components/PlatformBadge';

export default function AccountsPage() {
  const { authState, getToken } = useAuth();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (authState.isAuthenticated && authState.isAdmin) {
      loadAccounts();
    }
  }, [authState.isAuthenticated, authState.isAdmin]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAccounts(token);
      setAccounts(data.accounts);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (account: SocialAccount) => {
    setUpdating(account.platform);
    try {
      const token = await getToken();
      if (!token) return;
      await updateAccount(token, {
        platform: account.platform,
        is_active: !account.is_active,
      });
      loadAccounts();
    } catch (err) {
      console.error('Failed to update account:', err);
    } finally {
      setUpdating(null);
    }
  };

  if (authState.isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!authState.isAuthenticated || !authState.isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Platform Accounts</h1>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading accounts...</div>
      ) : (
        <div className="space-y-4">
          {accounts.map(account => (
            <div key={account.platform} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PlatformBadge platform={account.platform} />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{account.display_name || account.platform}</span>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{account.total_posts} posts</span>
                      {account.total_failures > 0 && (
                        <span className="text-red-500">{account.total_failures} failures</span>
                      )}
                      {account.last_posted_at && (
                        <span>Last: {new Date(account.last_posted_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Connection status */}
                  <span className={`text-xs ${account.is_connected ? 'text-green-600' : 'text-gray-400'}`}>
                    {account.is_connected ? 'Connected' : 'Not connected'}
                  </span>

                  {/* Token expiry warning */}
                  {account.token_expires_at && (
                    <span className={`text-xs ${
                      new Date(account.token_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        ? 'text-red-500'
                        : 'text-gray-500'
                    }`}>
                      Token expires: {new Date(account.token_expires_at).toLocaleDateString()}
                    </span>
                  )}

                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(account)}
                    disabled={updating === account.platform || !account.is_connected}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      account.is_active ? 'bg-indigo-600' : 'bg-gray-200'
                    } ${!account.is_connected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      account.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Error display */}
              {account.last_error && (
                <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-600">
                  Last error: {account.last_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
