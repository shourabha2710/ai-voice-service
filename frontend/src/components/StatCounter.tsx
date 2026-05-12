import { useState, useEffect, ReactNode } from "react";
import { motion, useSpring, useTransform, animate } from "framer-motion";

interface StatCounterProps {
  end: number;
  suffix?: string;
  label: string;
  icon: ReactNode;
}

export default function StatCounter({
  end,
  suffix = "",
  label,
  icon,
}: StatCounterProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controls = animate(0, end, {
      duration: 2,
      onUpdate: (value) => setCount(Math.floor(value)),
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [end]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.03)] flex items-center justify-center text-[#a78bfa] mb-4 border border-[rgba(255,255,255,0.06)]">
        {icon}
      </div>
      <div className="text-3xl font-bold tracking-tight mb-1 text-[#e8e8f0]">
        {count}
        {suffix}
      </div>
      <div className="text-xs font-medium text-[#555570] uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}
