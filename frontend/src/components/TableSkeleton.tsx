interface TableSkeletonProps {
  rows?: number
  cols: number
}

// Full-width gray-bar skeleton rows shown while a table's data loads.
export function TableSkeleton({ rows = 5, cols }: TableSkeletonProps) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 animate-pulse rounded bg-gray-100"
              style={{ maxWidth: c === cols - 1 ? '4rem' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
