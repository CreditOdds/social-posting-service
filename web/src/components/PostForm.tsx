'use client';

import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { createPost, generatePostText } from '@/lib/api';
import ImageUpload from './ImageUpload';
import PlatformBadge from './PlatformBadge';

const ALL_PLATFORMS = ['twitter', 'reddit', 'facebook', 'instagram', 'linkedin'];

interface PostFormProps {
  onSuccess?: () => void;
}

export default function PostForm({ onSuccess }: PostFormProps) {
  const { getToken } = useAuth();
  const [text, setText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [priority, setPriority] = useState('0');
  const [queueGroup, setQueueGroup] = useState('');
  const [minGapHours, setMinGapHours] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const handleGenerate = async () => {
    if (!aiTopic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const { text: generated } = await generatePostText(token, { topic: aiTopic });
      setText(generated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (status: 'draft' | 'queued') => {
    if (!text.trim()) {
      setError('Post text is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const trimmedPriority = priority.trim();
      let resolvedPriority: number | undefined;
      if (trimmedPriority.length > 0) {
        const parsedPriority = Number(trimmedPriority);
        if (!Number.isFinite(parsedPriority)) {
          setError('Priority must be a number');
          setSaving(false);
          return;
        }
        resolvedPriority = Math.trunc(parsedPriority);
      }

      const trimmedMinGap = minGapHours.trim();
      let resolvedMinGapMinutes: number | undefined;
      if (trimmedMinGap.length > 0) {
        const parsedGap = Number(trimmedMinGap);
        if (!Number.isFinite(parsedGap) || parsedGap < 0) {
          setError('Min gap must be a non-negative number');
          setSaving(false);
          return;
        }
        resolvedMinGapMinutes = Math.round(parsedGap * 60);
      }

      const trimmedQueueGroup = queueGroup.trim();

      await createPost(token, {
        text_content: text,
        image_url: imageUrl || undefined,
        link_url: linkUrl || undefined,
        status,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
        priority: resolvedPriority,
        queue_group: trimmedQueueGroup.length > 0 ? trimmedQueueGroup : undefined,
        min_gap_minutes: resolvedMinGapMinutes,
      });

      setSuccess(status === 'queued' ? 'Post queued!' : 'Draft saved!');
      setText('');
      setLinkUrl('');
      setImageUrl('');
      setPriority('0');
      setQueueGroup('');
      setMinGapHours('');
      setSelectedPlatforms([]);
      setAiTopic('');
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
      {/* AI Generate */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Generate with AI</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiTopic}
            onChange={e => setAiTopic(e.target.value)}
            placeholder="e.g., Chase Sapphire Preferred 80K bonus increased"
            className="flex-1 rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !aiTopic.trim()}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Text content */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Post text <span className="text-gray-400">({text.length}/280)</span>
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          maxLength={500}
          className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
          placeholder="Write your post..."
        />
      </div>

      {/* Link URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Link URL (optional)</label>
        <input
          type="url"
          value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          placeholder="https://creditodds.com/news/..."
          className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>

      {/* Image upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Image (optional)</label>
        <ImageUpload onUpload={setImageUrl} currentImage={imageUrl || null} />
      </div>

      {/* Platform selection */}
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
                selectedPlatforms.includes(p)
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Queue settings */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Queue settings</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority (higher = sooner)</label>
            <input
              type="number"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Queue group</label>
            <input
              type="text"
              value={queueGroup}
              onChange={e => setQueueGroup(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="evergreen"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min gap (hours)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={minGapHours}
              onChange={e => setMinGapHours(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Use settings default"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Leave min gap blank to use the global spacing from Settings. Add a queue group to enforce extra spacing within a specific series.
        </p>
      </div>

      {/* Error/success messages */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => handleSubmit('draft')}
          disabled={saving}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 disabled:opacity-50"
        >
          Save Draft
        </button>
        <button
          onClick={() => handleSubmit('queued')}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Queue Post'}
        </button>
      </div>
    </div>
  );
}
