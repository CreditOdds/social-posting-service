'use client';

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  queued: 'bg-blue-100 text-blue-700',
  posting: 'bg-yellow-100 text-yellow-700',
  posted: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-gray-100 text-gray-600',
  success: 'bg-green-100 text-green-700',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}
