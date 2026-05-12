import { motion } from "framer-motion";
import { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  color: string;
  index: number;
}

export default function FeatureCard({
  icon,
  title,
  description,
  color,
  index,
}: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      whileHover={{ y: -5, borderColor: "rgba(124,92,255,0.3)" }}
      className="p-8 bg-[#0d0d1a] border border-[rgba(255,255,255,0.06)] rounded-[32px] transition-all duration-300 group"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300"
        style={{ backgroundColor: color }}
      >
        <div className="text-[#a78bfa]">{icon}</div>
      </div>
      <h3 className="text-base font-bold text-[#e8e8f0] mb-3 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-[#8888a0] leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}
