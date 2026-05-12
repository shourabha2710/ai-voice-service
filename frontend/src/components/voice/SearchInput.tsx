import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative w-full">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555570]">
        <Search size={14} />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search voices, languages..."}
        className="w-full pl-10 pr-10 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl text-[#e8e8f0] text-sm outline-none transition-all duration-200 focus:border-[#7c5cff] focus:bg-[rgba(124,92,255,0.05)] placeholder:text-[#555570]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555570] hover:text-[#e8e8f0] transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
