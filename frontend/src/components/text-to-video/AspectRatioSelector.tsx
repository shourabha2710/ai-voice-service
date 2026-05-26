import { motion } from 'framer-motion';

interface AspectRatioSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const RATIOS = [
  { value: '16:9', label: '16:9', description: 'Landscape', icon: '⊞' },
  { value: '9:16', label: '9:16', description: 'Vertical (Reels)', icon: '⊟' },
];

export default function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-2">Aspect Ratio</label>
      <div className="flex gap-2">
        {RATIOS.map((ratio) => (
          <motion.button
            key={ratio.value}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(ratio.value)}
            className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              value === ratio.value
                ? 'bg-[#7c5cff]/20 border-[#7c5cff]/50 text-white'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-lg">{ratio.icon}</span>
              <span className="font-bold">{ratio.label}</span>
              <span className="text-[10px] opacity-60">{ratio.description}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
