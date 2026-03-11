'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getSettings, updateSettings, SocialSettings } from '@/lib/api';

const DEFAULT_SETTINGS: SocialSettings = {
  blackout: {
    enabled: true,
    start: '21:00',
    end: '07:00',
    timezone: 'America/New_York',
  },
};

export default function SettingsPage() {
  const { authState, getToken, signInWithGoogle } = useAuth();
  const [settings, setSettings] = useState<SocialSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (authState.isAuthenticated && authState.isAdmin) {
      loadSettings();
    }
  }, [authState.isAuthenticated, authState.isAdmin]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getSettings(token);
      if (data?.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await updateSettings(token, settings);
      if (data?.settings) {
        setSettings(data.settings);
      }
      setSuccess('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (authState.isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">CreditOdds Social</h1>
        <p className="text-gray-500 mb-6">Sign in to manage social settings</p>
        <button
          onClick={signInWithGoogle}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (!authState.isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading settings...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Blackout Window</h2>
            <p className="text-sm text-gray-500">
              Prevent posting during overnight hours (US Eastern time).
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={settings.blackout.enabled}
              onChange={e => setSettings({
                ...settings,
                blackout: { ...settings.blackout, enabled: e.target.checked },
              })}
            />
            Enable blackout
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start (ET)</label>
              <input
                type="time"
                value={settings.blackout.start}
                onChange={e => setSettings({
                  ...settings,
                  blackout: { ...settings.blackout, start: e.target.value },
                })}
                className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End (ET)</label>
              <input
                type="time"
                value={settings.blackout.end}
                onChange={e => setSettings({
                  ...settings,
                  blackout: { ...settings.blackout, end: e.target.value },
                })}
                className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Timezone</label>
              <input
                type="text"
                value={settings.blackout.timezone}
                onChange={e => setSettings({
                  ...settings,
                  blackout: { ...settings.blackout, timezone: e.target.value },
                })}
                className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="America/New_York"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
