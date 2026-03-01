'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getUploadUrl, uploadImage } from '@/lib/api';

interface ImageUploadProps {
  onUpload: (publicUrl: string) => void;
  currentImage?: string | null;
}

export default function ImageUpload({ onUpload, currentImage }: ImageUploadProps) {
  const { getToken } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPEG, PNG, GIF, and WebP images are allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const { upload_url, public_url } = await getUploadUrl(token, file.name, file.type);
      await uploadImage(upload_url, file);

      setPreview(public_url);
      onUpload(public_url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUpload('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="" className="h-32 rounded border border-gray-200 object-cover" />
          <button
            onClick={handleRemove}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            &times;
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            disabled={uploading}
          />
          {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
