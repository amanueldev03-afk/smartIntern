export default function RecommendationSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Header: Company, Title, Match Score */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-2 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
        </div>
        <div className="h-8 bg-gray-200 rounded-full w-20 animate-pulse" />
      </div>

      {/* Location, Work Mode, Deadline */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="h-5 bg-gray-200 rounded w-32 animate-pulse" />
        <div className="h-5 bg-gray-200 rounded w-24 animate-pulse" />
        <div className="h-5 bg-gray-200 rounded w-36 animate-pulse" />
      </div>

      {/* Required Skills */}
      <div className="mb-4">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 bg-gray-200 rounded w-16 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-20 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-18 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-14 animate-pulse" />
        </div>
      </div>

      {/* Description */}
      <div className="mb-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-4/6 animate-pulse" />
      </div>

      {/* AI Explanation */}
      <div className="mb-4 p-3 bg-gray-100 rounded-lg">
        <div className="h-4 bg-gray-200 rounded w-32 mb-2 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
        <div className="flex-1 h-10 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-10 bg-gray-200 rounded-lg w-24 animate-pulse" />
      </div>
    </div>
  )
}
