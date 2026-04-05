export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />;
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/4" />
          <SkeletonLine width="w-1/6" className="ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <SkeletonLine width="w-48" height="h-3" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <SkeletonLine width="w-1/4" />
            <SkeletonLine width="w-1/3" />
            <SkeletonLine width="w-16" />
            <SkeletonLine width="w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
