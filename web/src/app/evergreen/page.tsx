'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  getEvergreen,
  createEvergreen,
  updateEvergreen,
  deleteEvergreen,
  EvergreenItem,
} from '@/lib/api';
import ImageUpload from '@/components/ImageUpload';
import PlatformBadge from '@/components/PlatformBadge';

const ALL_PLATFORMS = ['twitter', 'facebook', 'instagram', 'linkedin'];
const CADENCES = ['daily', 'weekly', 'monthly'] as const;

interface FormState {
  id: number | null;
  text: string;
  linkUrl: string;
  imageUrl: string;
  cadence: string;
  preferredTime: string;
  platforms: string[];
}

const EMPTY_FORM: FormState = {
  id: null,
  text: '',
  linkUrl: '',
  imageUrl: '',
  cadence: 'weekly',
  preferredTime: '',
  platforms: [],
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

// TIME columns come back as "HH:MM:SS"; the time input wants "HH:MM".
function toTimeInput(value: string | null) {
  if (!value) return '';
  const match = String(value).match(/^(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

export default function EvergreenPage() {
  const { authState, getToken, signInWithGoogle } = useAuth();
  const [items, setItems] = useState<EvergreenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getEvergreen(token);
      setItems(data?.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evergreen posts');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (authState.isAuthenticated && authState.isAdmin) {
      loadItems();
    }
  }, [authState.isAuthenticated, authState.isAdmin, loadItems]);

  const togglePlatform = (p: string) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }));
  };

  const startEdit = (item: EvergreenItem) => {
    setForm({
      id: item.id,
      text: item.text_content,
      linkUrl: item.link_url || '',
      imageUrl: item.image_url || '',
      cadence: item.cadence,
      preferredTime: toTimeInput(item.preferred_time),
      platforms: item.platforms || [],
    });
    setShowForm(true);
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.text.trim()) {
      setError('Post text is required');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const payload = {
        text_content: form.text,
        link_url: form.linkUrl || undefined,
        image_url: form.imageUrl || undefined,
        cadence: form.cadence,
        preferred_time: form.preferredTime || null,
        platforms: form.platforms.length > 0 ? form.platforms : undefined,
      };

      if (form.id) {
        await updateEvergreen(token, { id: form.id, ...payload });
        setSuccess('Evergreen post updated.');
      } else {
        await createEvergreen(token, payload);
        setSuccess('Evergreen post created.');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: EvergreenItem) => {
    try {
      const token = await getToken();
      if (!token) return;
      await updateEvergreen(token, { id: item.id, is_active: !item.is_active });
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (item: EvergreenItem) => {
    if (!confirm(`Delete this evergreen post?\n\n"${item.text_content.slice(0, 100)}"`)) return;
    try {
      const token = await getToken();
      if (!token) return;
      await deleteEvergreen(token, item.id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (authState.isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">CreditOdds Social</h1>
        <p className="text-gray-500 mb-6">Sign in to manage evergreen posts</p>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evergreen Posts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recycled content that re-queues itself on a cadence. Items post at low priority so news always goes first.
          </p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setShowForm(!showForm);
            setError(null);
            setSuccess(null);
          }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          {showForm ? 'Close' : 'New Evergreen Post'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {success && <p className="text-sm text-green-600 mb-4">{success}</p>}

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4 mb-8">
          <h2 className="text-lg font-semibold text-gray-900">
            {form.id ? `Edit evergreen post #${form.id}` : 'New evergreen post'}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Post text <span className="text-gray-400">({form.text.length}/280)</span>
            </label>
            <textarea
              value={form.text}
              onChange={e => setForm({ ...form, text: e.target.value })}
              rows={4}
              maxLength={500}
              className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Write your evergreen post..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link URL (optional)</label>
            <input
              type="url"
              value={form.linkUrl}
              onChange={e => setForm({ ...form, linkUrl: e.target.value })}
              placeholder="https://creditodds.com/..."
              className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image (optional)</label>
            <ImageUpload
              onUpload={url => setForm(prev => ({ ...prev, imageUrl: url }))}
              currentImage={form.imageUrl || null}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platforms <span className="text-gray-400 text-xs">(leave empty for all active)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.platforms.includes(p)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-md">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cadence</label>
              <select
                value={form.cadence}
                onChange={e => setForm({ ...form, cadence: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {CADENCES.map(c => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Preferred time (blackout timezone)</label>
              <input
                type="time"
                value={form.preferredTime}
                onChange={e => setForm({ ...form, preferredTime: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create'}
            </button>
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowForm(false);
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading evergreen posts...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          No evergreen posts yet. Create one and it will re-queue itself on its cadence.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-lg shadow-sm border p-4 ${
                item.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{item.text_content}</p>
                  {item.link_url && (
                    <a
                      href={item.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline break-all"
                    >
                      {item.link_url}
                    </a>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      {item.cadence}
                      {item.preferred_time ? ` @ ${toTimeInput(item.preferred_time)}` : ''}
                    </span>
                    {(item.platforms || []).map(p => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                    {!item.is_active && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        paused
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Next queue: {item.is_active ? formatDateTime(item.next_run_at) : 'paused'} · Used {item.times_used}×
                    {item.last_enqueued_at ? ` · Last queued ${formatDateTime(item.last_enqueued_at)}` : ''}
                  </p>
                </div>
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-16 w-16 rounded object-cover flex-shrink-0"
                  />
                )}
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => startEdit(item)}
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(item)}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  {item.is_active ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
