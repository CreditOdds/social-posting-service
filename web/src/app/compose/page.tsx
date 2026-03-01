'use client';

import { useAuth } from '@/auth/AuthProvider';
import { useRouter } from 'next/navigation';
import PostForm from '@/components/PostForm';

export default function ComposePage() {
  const { authState } = useAuth();
  const router = useRouter();

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Compose Post</h1>
        <a href="/" className="text-sm text-gray-600 hover:text-gray-900">
          Back to Queue
        </a>
      </div>
      <PostForm onSuccess={() => router.push('/')} />
    </div>
  );
}
