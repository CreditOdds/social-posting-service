'use client';

import { SocialPost } from '@/lib/api';
import StatusBadge from './StatusBadge';
import PlatformBadge from './PlatformBadge';

interface PostCardProps {
  post: SocialPost;
  onEdit?: (post: SocialPost) => void;
  onDelete?: (post: SocialPost) => void;
  onQueue?: (post: SocialPost) => void;
  onRetry?: (post: SocialPost) => void;
  onPublish?: (post: SocialPost) => void;
}

export default function PostCard({ post, onEdit, onDelete, onQueue, onRetry, onPublish }: PostCardProps) {
  const canEdit = ['draft', 'queued', 'failed'].includes(post.status);
  const canQueue = post.status === 'draft';
  const canRetry = post.status === 'failed';
  const canPublish = ['queued', 'failed'].includes(post.status);
  const canDelete = post.status !== 'posting';
  const estimatedAt = post.estimated_post_at ? new Date(post.estimated_post_at) : null;
  const estimatedLocal = estimatedAt ? estimatedAt.toLocaleString() : null;
  const estimatedUtc = estimatedAt
    ? `${estimatedAt.toISOString().replace('T', ' ').replace('Z', ' UTC')}`
    : null;
  const scheduledAt = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const scheduledLocal = scheduledAt ? scheduledAt.toLocaleString() : 'ASAP';
  const scheduledUtc = scheduledAt
    ? `${scheduledAt.toISOString().replace('T', ' ').replace('Z', ' UTC')}`
    : null;
  const minGapLabel = post.min_gap_minutes
    ? post.min_gap_minutes % 60 === 0
      ? `${post.min_gap_minutes / 60}h`
      : `${post.min_gap_minutes}m`
    : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={post.status} />
            <span className="text-xs rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
              P{post.priority}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(post.created_at).toLocaleString()}
            </span>
            {post.source_type !== 'manual' && (
              <span className="text-xs text-gray-400">
                via {post.source_type}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {post.status === 'queued' && estimatedLocal ? (
              <>
                Estimated: {estimatedLocal}
                {estimatedUtc && <span> · {estimatedUtc}</span>}
              </>
            ) : (
              <>
                Scheduled: {scheduledLocal}
                {scheduledUtc && <span> · {scheduledUtc}</span>}
              </>
            )}
          </div>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{post.text_content}</p>
          {(post.priority !== 0 || post.queue_group || post.min_gap_minutes) && (
            <div className="mt-2 text-xs text-gray-500">
              <span>Priority {post.priority}</span>
              {post.queue_group && <span> · Group {post.queue_group}</span>}
              {minGapLabel && <span> · Min gap {minGapLabel}</span>}
            </div>
          )}
          {post.link_url && (
            <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 block truncate">
              {post.link_url}
            </a>
          )}
          {post.image_url && (
            <div className="mt-3">
              <img src={post.image_url} alt="" className="max-h-48 rounded-lg border border-gray-200 object-contain" />
            </div>
          )}
        </div>
      </div>

      {/* Platform targets */}
      {post.platforms && post.platforms.length > 0 && (
        <div className="flex gap-1 mt-3">
          {post.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
        </div>
      )}

      {/* Results (if posted or failed) */}
      {post.results && post.results.length > 0 && (
        <div className="mt-3 border-t pt-3 space-y-1">
          {post.results.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <PlatformBadge platform={r.platform} />
              <StatusBadge status={r.status} />
              {r.platform_post_url && (
                <a href={r.platform_post_url} target="_blank" rel="noopener noreferrer" className={`hover:underline truncate ${r.status === 'pending_manual' ? 'text-orange-600 font-semibold' : 'text-indigo-600'}`}>
                  {r.status === 'pending_manual' ? 'Post now →' : 'View'}
                </a>
              )}
              {r.error_message && (
                <span className="text-red-500 truncate" title={r.error_message}>
                  {r.error_message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t">
        {canEdit && onEdit && (
          <button onClick={() => onEdit(post)} className="text-xs text-gray-600 hover:text-gray-900">
            Edit
          </button>
        )}
        {canQueue && onQueue && (
          <button onClick={() => onQueue(post)} className="text-xs text-indigo-600 hover:text-indigo-800">
            Queue
          </button>
        )}
        {canPublish && onPublish && (
          <button onClick={() => onPublish(post)} className="text-xs text-green-600 hover:text-green-800 font-semibold">
            Post Now
          </button>
        )}
        {canRetry && onRetry && (
          <button onClick={() => onRetry(post)} className="text-xs text-orange-600 hover:text-orange-800">
            Retry
          </button>
        )}
        {canDelete && onDelete && (
          <button onClick={() => onDelete(post)} className="text-xs text-red-600 hover:text-red-800">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
