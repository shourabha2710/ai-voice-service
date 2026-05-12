export function GeneratorSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-3 w-16 bg-[#12121f] rounded mb-3" />
        <div className="h-[140px] w-full bg-[#12121f] rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="h-3 w-16 bg-[#12121f] rounded mb-3" />
          <div className="h-11 w-full bg-[#12121f] rounded-xl" />
        </div>
        <div>
          <div className="h-3 w-16 bg-[#12121f] rounded mb-3" />
          <div className="h-11 w-full bg-[#12121f] rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="h-3 w-20 bg-[#12121f] rounded mb-4" />
          <div className="h-1 w-full bg-[#12121f] rounded" />
        </div>
        <div>
          <div className="h-3 w-20 bg-[#12121f] rounded mb-4" />
          <div className="h-1 w-full bg-[#12121f] rounded" />
        </div>
      </div>
      <div className="h-10 w-full bg-[#12121f] rounded-xl" />
      <div className="flex gap-3">
        <div className="h-14 flex-1 bg-[#12121f] rounded-2xl" />
        <div className="h-14 flex-1 bg-[#12121f] rounded-2xl" />
      </div>
    </div>
  );
}

export function JobItemSkeleton() {
  return (
    <div className="flex items-center gap-4 p-5 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[16px] animate-pulse">
      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-24 bg-[#12121f] rounded" />
          <div className="h-4 w-16 bg-[#12121f] rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-2 w-32 bg-[#12121f] rounded" />
          <div className="h-2 w-20 bg-[#12121f] rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-20 bg-[#12121f] rounded-xl" />
        <div className="h-8 w-20 bg-[#12121f] rounded-xl" />
      </div>
    </div>
  );
}
