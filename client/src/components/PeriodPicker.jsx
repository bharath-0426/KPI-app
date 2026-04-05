import { useState, useEffect } from 'react';
import { useSearchParamState } from '../lib/useSearchParamState';
import { getAvailablePeriods, getDefaultPeriods } from '../lib/api';
import { Clock } from 'lucide-react';
import { FREQ_TYPES } from '../lib/constants';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2025 + 1 }, (_, i) => 2025 + i).reverse();

export default function PeriodPicker({ onSelect, selected, freqTypes, scoringWindow }) {
  const [activeType, setActiveType] = useSearchParamState('type', 'weekly');
  const [yearStr,    setYear]       = useSearchParamState('year', CURRENT_YEAR);
  const year = Number(yearStr);
  const [periods,    setPeriods]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [defaults,   setDefaults]   = useState({});

  useEffect(() => {
    if (freqTypes?.length > 0 && !freqTypes.find(f => f.key === activeType)) {
      setActiveType(freqTypes[0].key);
    }
  }, [freqTypes]); // eslint-disable-line

  useEffect(() => {
    getDefaultPeriods().then(setDefaults).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getAvailablePeriods(activeType, year)
      .then(ps => {
        setPeriods(ps);
        const def = defaults[activeType];
        const target = def ? ps.find(p => p.id === def.id) : ps[0];
        if (target) onSelect(target);
        else if (ps.length > 0) onSelect(ps[0]);
      })
      .catch(() => setPeriods([]))
      .finally(() => setLoading(false));
  }, [activeType, year]); // eslint-disable-line

  useEffect(() => {
    const def = defaults[activeType];
    if (def && periods.length > 0) {
      const match = periods.find(p => p.id === def.id);
      if (match) onSelect(match);
    }
  }, [defaults]); // eslint-disable-line

  const types = freqTypes?.length > 0 ? freqTypes : FREQ_TYPES;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      {/* Type tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        {types.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveType(key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeType === key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Year */}
      <select
        value={year}
        onChange={e => setYear(parseInt(e.target.value))}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      >
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Period */}
      {loading ? (
        <span className="text-sm text-gray-400">Loading…</span>
      ) : periods.length === 0 ? (
        <span className="text-sm text-gray-400">No periods yet</span>
      ) : (
        <select
          value={selected?.id ?? ''}
          onChange={e => {
            const p = periods.find(p => p.id === parseInt(e.target.value));
            if (p) onSelect(p);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent min-w-44"
        >
          {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      )}

      {/* Scoring window badge */}
      {scoringWindow && (
        scoringWindow.open ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full text-xs font-medium text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Open for scoring
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-500">
            <Clock size={11} />
            Read only
          </span>
        )
      )}
    </div>
  );
}
