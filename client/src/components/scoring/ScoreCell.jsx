import { Info } from 'lucide-react';

export default function ScoreCell({ template, value, onChange, onBlur, disabled, inputRef }) {
  const min    = template.stc_min    ?? null;
  const max    = template.stc_max    ?? null;
  const step   = template.stc_step   ?? 1;
  const suffix = template.stc_suffix ?? '';

  if (template.score_type === 'raw_100') {
    return (
      <span className="text-xs text-gray-400 italic flex items-center gap-1">
        <Info size={11} /> ₹100 dist.
      </span>
    );
  }

  if (min !== null && max !== null && Number(step) >= 1 && Number.isInteger(Number(step))) {
    const options = [];
    for (let v = min; v <= max; v += Number(step)) options.push(Math.round(v));
    if (options.length <= 12) {
      return (
        <div className="flex items-center gap-1.5">
          <select
            ref={inputRef}
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
            onBlur={onBlur}
            disabled={disabled}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 min-w-[68px] bg-white"
          >
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
        </div>
      );
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="number"
        value={value ?? ''}
        step={step}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        onBlur={onBlur}
        disabled={disabled}
        className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 text-center"
        placeholder="—"
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  );
}
