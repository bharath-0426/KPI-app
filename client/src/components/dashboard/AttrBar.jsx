export default function AttrBar({ attr }) {
  const { total, scored, reconciled, attribute_name } = attr;
  const recPct  = total > 0 ? (reconciled / total) * 100 : 0;
  const scorePct = total > 0 ? ((scored - reconciled) / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-xs text-gray-700 truncate pr-2">{attribute_name}</span>
        <span className="text-xs text-gray-400 shrink-0">{reconciled}/{total}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-gray-900" style={{ width: `${recPct}%` }} />
        <div className="bg-gray-300" style={{ width: `${scorePct}%` }} />
      </div>
    </div>
  );
}
