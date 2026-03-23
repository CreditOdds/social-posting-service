'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getPosts, SocialPost } from '@/lib/api';
import PostCard from '@/components/PostCard';

export default function HistoryPage() {
  const { authState, getToken } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authState.isAuthenticated && authState.isAdmin) {
      loadHistory();
    }
  }, [authState.isAuthenticated, authState.isAdmin]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getPosts(token);
      const postedPosts = (data.posts || [])
        .filter((post: SocialPost) => Boolean(post.posted_at))
        .sort((a: SocialPost, b: SocialPost) => {
          const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0;
          const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0;
          return bTime - aTime;
        });
      setPosts(postedPosts);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Post History</h1>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading history...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No posted content yet.</div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
