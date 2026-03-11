const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return res.json();
}

// Types
export interface SocialPost {
  id: number;
  text_content: string;
  image_url: string | null;
  link_url: string | null;
  source_type: 'manual' | 'news' | 'article' | 'api';
  source_id: string | null;
  status: 'draft' | 'queued' | 'posting' | 'posted' | 'failed' | 'cancelled';
  priority: number;
  queue_group: string | null;
  min_gap_minutes: number | null;
  estimated_post_at: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  platforms: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  results: PostResult[];
}

export interface PostResult {
  id: number;
  platform: string;
  status: 'pending' | 'success' | 'failed';
  platform_post_id: string | null;
  platform_post_url: string | null;
  error_message: string | null;
  attempted_at: string | null;
}

export interface SocialAccount {
  id: number;
  platform: string;
  display_name: string | null;
  is_active: boolean;
  is_connected: boolean;
  config: Record<string, unknown>;
  token_expires_at: string | null;
  last_error: string | null;
  last_posted_at: string | null;
  total_posts: number;
  total_failures: number;
}

export interface SocialSettings {
  blackout: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  queue: {
    min_gap_minutes: number;
  };
}

// Posts API
export async function getPosts(token: string, status?: string) {
  const params = status ? `?status=${status}` : '';
  return apiFetch(`/social/posts${params}`, token);
}

export async function createPost(token: string, data: {
  text_content: string;
  image_url?: string;
  link_url?: string;
  source_type?: string;
  status?: string;
  priority?: number;
  queue_group?: string;
  min_gap_minutes?: number | null;
  scheduled_at?: string;
  platforms?: string[];
}) {
  return apiFetch('/social/posts', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePost(token: string, data: {
  id: number;
  text_content?: string;
  image_url?: string;
  link_url?: string;
  status?: string;
  priority?: number;
  queue_group?: string | null;
  min_gap_minutes?: number | null;
  scheduled_at?: string;
  platforms?: string[];
}) {
  return apiFetch('/social/posts', token, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePost(token: string, id: number) {
  return apiFetch(`/social/posts?id=${id}`, token, { method: 'DELETE' });
}

// Accounts API
export async function getAccounts(token: string) {
  return apiFetch('/social/accounts', token);
}

export async function updateAccount(token: string, data: {
  platform: string;
  is_active?: boolean;
  is_connected?: boolean;
  display_name?: string;
}) {
  return apiFetch('/social/accounts', token, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Settings API
export async function getSettings(token: string) {
  return apiFetch('/social/settings', token);
}

export async function updateSettings(token: string, settings: SocialSettings) {
  return apiFetch('/social/settings', token, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// Generate API
export async function generatePostText(token: string, data: {
  topic: string;
  context?: string;
  tone?: string;
}) {
  return apiFetch('/social/generate', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Upload API
export async function getUploadUrl(token: string, filename: string, content_type: string) {
  return apiFetch('/social/upload', token, {
    method: 'POST',
    body: JSON.stringify({ filename, content_type }),
  });
}

export async function uploadImage(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
}
