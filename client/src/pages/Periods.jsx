import React, { useState, useEffect } from 'react';
import { useSearchParamState } from '../lib/useSearchParamState';
import { getPeriods, updatePeriod, deletePeriod, getFrequencies } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { Calendar, Lock, Trash2, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';

const TYPE_COLORS = {
  yearly:    'bg-gray-100 text-gray-700 border-gray-200',
  quarterly: 'bg-gray-100 text-gray-700 border-gray-200',
  monthly:   'bg-gray-100 text-gray-700 border-gray-200',
  weekly:    'bg-gray-100 text-gray-700 border-gray-200',
};

const TYPE_ORDER = { yearly: 0, quarterly: 1, monthly: 2, weekly: 3 };

function PeriodRow({ period, onToggleActive, onRequestDelete }) {
  const [expanded,      setExpanded]      = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const { stats } = period;

  const handleToggle = async () => {
    setActionLoading(true);
    try { await onToggleActive(period); }
    finally { setActionLoading(false); }
  };

  return (
    <div className={`bg-white rounded-xl border transition-all ${period.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${TYPE_COLORS[period.period_type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {period.period_type}
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{period.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{period.start_date} → {period.end_date}</p>
        </div>

        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${period.is_active ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
          {period.is_active ? 'Open' : 'Closed'}
        </span>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{stats.self_submitted}</span>/{stats.total_employees} submitted
          {stats.disputed > 0 && (
            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full font-medium ml-1">
              {stats.disputed} disputed
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleToggle}
            disabled={actionLoading}
            className={`p-1.5 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1 ${
              period.is_active
                ? 'text-gray-500 hover:bg-gray-100'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Lock size={13} />
            {period.is_active ? 'Close' : 'Reopen'}
          </button>

          {stats.self_submitted === 0 && (
            <button
              onClick={() => onRequestDelete(period)}
              disabled={actionLoading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-xl">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'employees', value: stats.total_employees, color: 'bg-gray-100 text-gray-600' },
              { label: 'self-submitted', value: stats.self_submitted, color: 'bg-gray-100 text-gray-600' },
              { label: 'manager-reviewed', value: stats.manager_reviewed, color: 'bg-gray-200 text-gray-700' },
              { label: 'reconciled', value: stats.reconciled, color: 'bg-gray-900 text-white' },
              ...(stats.disputed > 0 ? [{ label: 'disputed', value: stats.disputed, color: 'bg-red-50 text-red-700' }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${color}`}>
                {value} {label}
              </div>
            ))}
          </div>
          {stats.total_employees > 0 && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-gray-900 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (stats.self_submitted / stats.total_employees) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {Math.round((stats.self_submitted / stats.total_employees) * 100)}% self-submitted ·{' '}
                {Math.round((stats.reconciled / stats.total_employees) * 100)}% reconciled
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Periods() {
  const { addToast } = useToast();
  const [periods,       setPeriods]       = useState([]);
  const [freqTypes,     setFreqTypes]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [typeFilter,   setTypeFilter]   = useSearchParamState('type', 'all');
  const [statusFilter, setStatusFilter] = useSearchParamState('status', 'all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    getFrequencies().then(setFreqTypes).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    getPeriods()
      .then(ps => {
        ps.sort((a, b) => {
          const to = (TYPE_ORDER[a.period_type] ?? 9) - (TYPE_ORDER[b.period_type] ?? 9);
          if (to !== 0) return to;
          return b.start_date.localeCompare(a.start_date);
        });
        setPeriods(ps);
      })
      .catch(e => setError(e.response?.data?.error || 'Failed to load periods'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (period) => {
    await updatePeriod(period.id, { is_active: !period.is_active });
    addToast(`Period ${period.is_active ? 'closed' : 'reopened'}.`);
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deletePeriod(confirmDelete.id);
      addToast(`"${confirmDelete.label}" deleted.`);
      load();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const filtered = periods.filter(p => {
    const matchType   = typeFilter === 'all' || p.period_type === typeFilter;
    const matchStatus = statusFilter === 'all' ? true : statusFilter === 'open' ? p.is_active : !p.is_active;
    return matchType && matchStatus;
  });

  return (
    <div className="p-5">
      <ConfirmModal
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.label}"?`}
        message="This cannot be undone. Only periods with no scores can be deleted."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <div className="mb-4">
        <h1 className="text-sm font-semibold text-gray-900">Scoring Periods</h1>
        <p className="text-xs text-gray-400 mt-0.5">Periods are auto-created when employees score KPIs.</p>
      </div>

      <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start gap-2 text-sm text-gray-600">
        <Info size={14} className="mt-0.5 shrink-0 text-gray-400" />
        <span>
          Periods are automatically generated when employees select them on the KPI Scoring page.
          Weekly periods run <strong>Monday to Friday</strong>. Higher-period scores are <strong>auto-calculated</strong> as averages of their sub-periods.
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="all">All Types</option>
          {freqTypes.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <span className="ml-auto flex items-center text-xs text-gray-400">
          {filtered.length} period{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Calendar size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm">No periods found</p>
          <p className="text-xs text-gray-400 mt-1">Periods appear here once employees start scoring their KPIs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PeriodRow
              key={p.id}
              period={p}
              onToggleActive={handleToggleActive}
              onRequestDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
