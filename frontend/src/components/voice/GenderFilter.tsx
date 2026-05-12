import { motion } from "framer-motion";
import { User, Users } from "lucide-react";

interface GenderFilterProps {
  gender: string;
  setGender: (gender: string) => void;
}

export default function GenderFilter({ gender, setGender }: GenderFilterProps) {
  const options = [
    { value: "all", label: "All", icon: <Users size={14} /> },
    { value: "Male", label: "Male", icon: <User size={14} /> },
    { value: "Female", label: "Female", icon: <User size={14} /> },
  ];

  return (
    <div className="flex p-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl w-full">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setGender(opt.value)}
          className={`relative flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold transition-all duration-300 z-10 ${
            gender === opt.value ? "text-white" : "text-[#8888a0] hover:text-[#e8e8f0]"
          }`}
        >
          {opt.icon}
          {opt.label}
          {gender === opt.value && (
            <motion.div
              layoutId="gender-pill"
              className="absolute inset-0 bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] rounded-lg -z-10 shadow-lg shadow-[#7c5cff]/20"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
