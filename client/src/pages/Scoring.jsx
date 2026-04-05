import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getMyScores, submitSelfScores, getFrequencies,
} from '../lib/api';
import {
  ClipboardCheck, AlertCircle, Clock, BarChart2,
} from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker';
import KpiRow from '../components/scoring/KpiRow';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Scoring() {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [data,           setData]           = useState(null);
  const [freqTypes,      setFreqTypes]      = useState(null);
  const [localScores,    setLocalScores]    = useState({});
  const [localNotes,     setLocalNotes]     = useState({});
  const [rowStates,      setRowStates]      = useState({});  // tid → 'idle'|'saving'|'saved'|'error'
  const [expandedRows,   setExpandedRows]   = useState({});
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [scoringWindow,  setScoringWindow]  = useState(null); // { open, opens_on, reason }

  const scrollRef = useRef(null);

  // Use a ref so autoSave always has the latest values without stale closures
  const stateRef = useRef({});
  stateRef.current = { selectedPeriod, data, localScores, localNotes };

  useEffect(() => {
    getFrequencies()
      .then(fs => setFreqTypes(fs.map(f => ({ key: f.key, label: f.label }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    setLoading(true);
    setError('');
    setLocalScores({});
    setLocalNotes({});
    setRowStates({});
    setExpandedRows({});
    setData(null);
    setScoringWindow(null);
    getMyScores(selectedPeriod.id)
      .then(d => { setData(d); setScoringWindow(d.window ?? null); })
      .catch(e => setError(e.response?.data?.error || 'Failed to load scores'))
      .finally(() => setLoading(false));
  }, [selectedPeriod]);

  const handleScoreChange = useCallback((tid, v) =>
    setLocalScores(s => ({ ...s, [tid]: v })), []);

  const handleNotesChange = useCallback((tid, v) =>
    setLocalNotes(n => ({ ...n, [tid]: v })), []);

  const toggleExpand = useCallback((tid) =>
    setExpandedRows(prev => ({ ...prev, [tid]: !prev[tid] })), []);

  // Auto-save a single row on blur — reads latest state via ref to avoid stale closures
  const autoSave = useCallback(async (tid) => {
    const { selectedPeriod, data, localScores, localNotes } = stateRef.current;
    if (!selectedPeriod || !data) return;

    const item = data.items.find(i => i.template.id === tid);
    if (!item) return;

    const hasLocalScore = localScores[tid] !== undefined;
    const hasLocalNotes = localNotes[tid] !== undefined;
    if (!hasLocalScore && !hasLocalNotes) return;

    const score = localScores[tid] !== undefined ? localScores[tid] : item.score?.self_score;
    if (score === null || score === undefined) return;  // need a score to submit

    const notes = localNotes[tid] !== undefined ? localNotes[tid] : (item.score?.self_notes || '');

    setRowStates(s => ({ ...s, [tid]: 'saving' }));

    try {
      const result = await submitSelfScores(selectedPeriod.id, [{
        kpi_template_id: tid,
        self_score: score,
        self_notes: notes,
      }]);
      setData(prev => ({ ...prev, items: result.items }));
      setLocalScores(s => { const n = { ...s }; delete n[tid]; return n; });
      setLocalNotes(s => { const n = { ...s }; delete n[tid]; return n; });
      setRowStates(s => ({ ...s, [tid]: 'saved' }));
      setTimeout(() => setRowStates(s => ({
        ...s, [tid]: s[tid] === 'saved' ? 'idle' : s[tid],
      })), 1800);
    } catch (err) {
      setRowStates(s => ({ ...s, [tid]: 'error' }));
    }
  }, []); // stable — always reads latest via ref

  // Grouped by attribute
  const grouped = {};
  if (data?.items) {
    for (const item of data.items) {
      const attr = item.template.attribute_name;
      if (!grouped[attr]) grouped[attr] = [];
      grouped[attr].push(item);
    }
  }

  const scorableItems = data?.items?.filter(i =>
    i.template.score_type !== 'raw_100' && !i.score?.is_aggregated
  ) || [];
  const submittedCount = scorableItems.filter(i =>
    i.score && ['self_submitted', 'both_submitted', 'disputed', 'reconciled'].includes(i.score.status)
  ).length;
  const aggCount = data?.items?.filter(i => i.score?.is_aggregated).length || 0;
  const pct = scorableItems.length ? Math.round((submittedCount / scorableItems.length) * 100) : 0;

  return (
    <div className="p-5 overflow-y-auto flex-1" ref={scrollRef}>
      <div className="mb-4">
        <h1 className="text-sm font-semibold text-gray-900">KPI Self-Assessment</h1>
        <p className="text-xs text-gray-400 mt-0.5">Scores auto-save as you Tab or click away</p>
      </div>

      <PeriodPicker selected={selectedPeriod} onSelect={setSelectedPeriod} freqTypes={freqTypes} scoringWindow={scoringWindow} />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400">
          <Clock size={28} className="mx-auto mb-2 animate-pulse" />
          Loading KPIs…
        </div>
      )}

      {!loading && data && data.items.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardCheck size={28} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm">No KPIs found for this period</p>
          <p className="text-xs text-gray-400 mt-1">
            No KPI templates match the selected frequency and period for your role.
          </p>
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

          {/* Progress header */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-gray-900">{submittedCount}</span>
              <span className="text-gray-400">/ {scorableItems.length} submitted</span>
            </div>
            {aggCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <BarChart2 size={13} /> {aggCount} auto-calculated
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400">{pct}%</span>
              <div className="w-32 bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-gray-900 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Scoring window banner */}
          {scoringWindow && !scoringWindow.open && (
            <div className="mx-5 mt-4 mb-1 flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              <Clock size={15} className="shrink-0" />
              <span><strong>Read only.</strong> {scoringWindow.reason}</span>
            </div>
          )}

          {/* Scoring table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    KPI
                  </th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">
                    Wt.
                  </th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44 text-left">
                    Score
                  </th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32 text-left">
                    Status
                  </th>
                  <th className="py-2.5 px-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([attr, items]) => (
                  <React.Fragment key={attr}>
                    {/* Attribute section header */}
                    <tr>
                      <td
                        colSpan={5}
                        className="py-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50/80 border-b border-gray-200"
                      >
                        {attr}
                      </td>
                    </tr>

                    {/* KPI rows */}
                    {items.map(item => (
                      <KpiRow
                        key={item.template.id}
                        item={item}
                        localScore={localScores[item.template.id]}
                        localNotes={localNotes[item.template.id]}
                        onScoreChange={handleScoreChange}
                        onNotesChange={handleNotesChange}
                        onSave={autoSave}
                        rowState={rowStates[item.template.id] || 'idle'}
                        periodType={selectedPeriod?.period_type}
                        expanded={!!expandedRows[item.template.id]}
                        onToggleExpand={toggleExpand}
                        windowOpen={scoringWindow?.open ?? true}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hint footer */}
          <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-400 flex items-center gap-2 flex-wrap">
            <span>Tab between scores — each saves automatically on blur.</span>
            <span>·</span>
            <span>Use <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-500 font-mono">▾</kbd> to expand a row.</span>
            <span className="ml-auto">Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-500 font-mono">1</kbd>–<kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-500 font-mono">5</kbd> on a focused score button to set it quickly.</span>
          </div>
        </div>

        <div className="flex justify-center mt-4">
          <button
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ↑ Back to top
          </button>
        </div>
        </>
      )}
    </div>
  );
}
