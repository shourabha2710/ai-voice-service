interface DurationSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const DURATIONS = [
  { value: 8, label: '8s' },
  { value: 12, label: '12s' },
  { value: 16, label: '16s' },
  { value: 24, label: '24s' },
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
];

export default function DurationSelector({ value, onChange }: DurationSelectorProps) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-2">Duration</label>
      <div className="flex gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            onClick={() => onChange(d.value)}
            className={`flex-1 px-2 py-2.5 rounded-xl text-xs font-medium transition-all border ${
              value === d.value
                ? 'bg-[#7c5cff]/20 border-[#7c5cff]/50 text-white'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
