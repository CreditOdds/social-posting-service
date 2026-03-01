'use client';

const platformStyles: Record<string, { bg: string; text: string; label: string }> = {
  twitter: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Twitter/X' },
  reddit: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Reddit' },
  facebook: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Facebook' },
  instagram: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Instagram' },
  linkedin: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'LinkedIn' },
};

export default function PlatformBadge({ platform }: { platform: string }) {
  const style = platformStyles[platform] || { bg: 'bg-gray-100', text: 'text-gray-700', label: platform };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
