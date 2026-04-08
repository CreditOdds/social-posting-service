'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { getPosts, updatePost, deletePost, publishPost, SocialPost } from '@/lib/api';
import PostCard from '@/components/PostCard';

export default function DashboardPage() {
  const { authState, getToken, signInWithGoogle } = useAuth();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    if (authState.isAuthenticated && authState.isAdmin) {
      loadPosts();
    }
  }, [authState.isAuthenticated, authState.isAdmin, filter]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getPosts(token, filter || undefined);
      setPosts(data.posts);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQueue = async (post: SocialPost) => {
    try {
      const token = await getToken();
      if (!token) return;
      await updatePost(token, { id: post.id, status: 'queued' });
      loadPosts();
    } catch (err) {
      console.error('Failed to queue post:', err);
    }
  };

  const handleRetry = async (post: SocialPost) => {
    try {
      const token = await getToken();
      if (!token) return;
      await updatePost(token, { id: post.id, status: 'queued' });
      loadPosts();
    } catch (err) {
      console.error('Failed to retry post:', err);
    }
  };

  const handlePublish = async (post: SocialPost) => {
    if (!confirm('Post this to all platforms now?')) return;
    try {
      const token = await getToken();
      if (!token) return;
      await publishPost(token, post.id);
      loadPosts();
    } catch (err) {
      console.error('Failed to publish post:', err);
      alert(`Failed to publish: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (post: SocialPost) => {
    if (!confirm('Delete this post?')) return;
    try {
      const token = await getToken();
      if (!token) return;
      await deletePost(token, post.id);
      loadPosts();
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  if (authState.isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">CreditOdds Social</h1>
        <p className="text-gray-500 mb-6">Sign in to manage social media posts</p>
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

  // Stats summary
  const queued = posts.filter(p => p.status === 'queued').length;
  const drafts = posts.filter(p => p.status === 'draft').length;
  const failed = posts.filter(p => p.status === 'failed').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Post Queue</h1>
        <a href="/compose" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
          New Post
        </a>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{queued}</div>
          <div className="text-sm text-gray-500">Queued</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
          <div className="text-2xl font-bold text-gray-600">{drafts}</div>
          <div className="text-sm text-gray-500">Drafts</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{failed}</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="draft">Drafts</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Post list */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No posts found. <a href="/compose" className="text-indigo-600 hover:underline">Create one</a>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onQueue={handleQueue}
              onRetry={handleRetry}
              onPublish={handlePublish}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
