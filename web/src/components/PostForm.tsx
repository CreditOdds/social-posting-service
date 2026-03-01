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

      await createPost(token, {
        text_content: text,
        image_url: imageUrl || undefined,
        link_url: linkUrl || undefined,
        status,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      });

      setSuccess(status === 'queued' ? 'Post queued!' : 'Draft saved!');
      setText('');
      setLinkUrl('');
      setImageUrl('');
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
