import { ChevronRight } from 'lucide-react';

export default function Tile({ label, value, sub, subCls = 'text-gray-400', action, onClick }) {
  const inner = (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        {sub && <p className={`text-xs ${subCls}`}>{sub}</p>}
        {action && <span className="text-xs text-gray-400 flex items-center gap-0.5">{action} <ChevronRight size={11} /></span>}
      </div>
    </div>
  );
  return inner;
}
