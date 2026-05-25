import { Search, Filter } from 'lucide-react';

export type FilterType = 'all' | 'audio' | 'video' | 'completed' | 'failed' | 'downloading' | 'cancelled';
export type SortType = 'newest' | 'oldest';

interface VideoFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterType: FilterType;
  onFilterChange: (f: FilterType) => void;
  sortType: SortType;
  onSortChange: (s: SortType) => void;
  totalCount: number;
  filteredCount: number;
}

const filters: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Audio', value: 'audio' },
  { label: 'Video', value: 'video' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Downloading', value: 'downloading' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function VideoFilters({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  sortType,
  onSortChange,
  totalCount,
  filteredCount,
}: VideoFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by title or URL..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#7c5cff] focus:ring-1 focus:ring-[#7c5cff]/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-white/30 shrink-0" />
          <select
            value={sortType}
            onChange={(e) => onSortChange(e.target.value as SortType)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-[#7c5cff]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterType === f.value
                ? 'bg-[#7c5cff] text-white shadow-sm shadow-[#7c5cff]/30'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/30">
        Showing {filteredCount} of {totalCount} downloads
      </p>
    </div>
  );
}

export type { FilterType, SortType };
