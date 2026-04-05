import { useState, useEffect, useMemo } from 'react';
import { getDisputes, resolveDispute } from '../lib/api';

export default function Reconcile() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // score_id
  const [finalScore, setFinalScore] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getDisputes();
      setDisputes(data);
    } catch {
      setError('Failed to load disputes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Group disputes by employee + period
  const groups = useMemo(() => {
    const map = {};
    for (const d of disputes) {
      const key = `${d.employee_id}__${d.scoring_period_id}`;
      if (!map[key]) {
        map[key] = {
          employee_name: d.employee_name,
          employee_role: d.employee_role,
          period_label: d.period_label,
          manager_name: d.manager_name,
          items: [],
        };
      }
      map[key].items.push(d);
    }
    return Object.values(map);
  }, [disputes]);

  const selectedDispute = disputes.find(d => d.score_id === selected);

  function openDispute(d) {
    setSelected(d.score_id);
    setFinalScore('');
    setNotes('');
    setSubmitError('');
  }

  function getScoreOptions(score_type) {
    if (score_type === 'scale_2_5') return [2, 3, 4, 5];
    if (score_type === 'scale_1_5') return [1, 2, 3, 4, 5];
    if (score_type === 'scale_1_10') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    return null; // raw_100 / calculated — free input
  }

  async function handleResolve(e) {
    e.preventDefault();
    const val = parseFloat(finalScore);
    if (finalScore === '' || isNaN(val)) {
      setSubmitError('Please enter a valid final score.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await resolveDispute(selected, val, notes || null);
      setSelected(null);
      await load();
    } catch (err) {
      setSubmitError(err?.response?.data?.error || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading disputes…</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="p-5 overflow-y-auto flex-1">
      <h1 className="text-sm font-semibold text-gray-900 mb-0.5">Reconciliation</h1>
      <p className="text-xs text-gray-400 mb-5">
        Disputed scores where self-score and manager-score differ by ≥ 1 point. Set the final score.
      </p>

      {disputes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-gray-600 font-medium">No disputes to reconcile</p>
          <p className="text-sm text-gray-400 mt-1">All scores are in agreement or already resolved.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Left panel: dispute list */}
          <div className="w-80 flex-shrink-0 space-y-3">
            {groups.map((g, gi) => (
              <div key={gi} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="font-semibold text-gray-800 text-sm">{g.employee_name}</div>
                  <div className="text-xs text-gray-500">{g.employee_role} · {g.period_label}</div>
                  {g.manager_name && (
                    <div className="text-xs text-gray-400 mt-0.5">Manager: {g.manager_name}</div>
                  )}
                </div>
                <div className="divide-y divide-gray-100">
                  {g.items.map(d => {
                    const diff = Math.abs((d.self_score ?? 0) - (d.manager_score ?? 0));
                    const isSelected = selected === d.score_id;
                    return (
                      <button
                        key={d.score_id}
                        onClick={() => openDispute(d)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-gray-50 border-l-4 border-gray-900' : ''
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-700 truncate">
                          {d.attribute_name} · {d.sub_metric_name}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">
                            Self: <span className="font-semibold text-gray-700">{d.self_score ?? '—'}</span>
                          </span>
                          <span className="text-xs text-gray-500">
                            Mgr: <span className="font-semibold text-gray-500">{d.manager_score ?? '—'}</span>
                          </span>
                          <span className="text-xs font-medium text-gray-500 ml-auto">
                            Δ {diff.toFixed(1)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Right panel: detail + form */}
          <div className="flex-1">
            {!selectedDispute ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                Select a dispute from the list to resolve it.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Disputed Score</div>
                  <h2 className="text-lg font-bold text-gray-800">
                    {selectedDispute.attribute_name} — {selectedDispute.sub_metric_name}
                  </h2>
                  <div className="text-sm text-gray-600 mt-0.5">
                    {selectedDispute.employee_name} · {selectedDispute.period_label}
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Score comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Self Score</div>
                      <div className="text-3xl font-bold text-gray-700">{selectedDispute.self_score ?? '—'}</div>
                      {selectedDispute.self_notes && (
                        <div className="text-xs text-gray-600 mt-2 text-left bg-gray-100 rounded p-2">
                          <span className="font-medium">Notes:</span> {selectedDispute.self_notes}
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-100 rounded-lg p-4 text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Manager Score</div>
                      <div className="text-3xl font-bold text-gray-700">{selectedDispute.manager_score ?? '—'}</div>
                      {selectedDispute.manager_notes && (
                        <div className="text-xs text-gray-600 mt-2 text-left bg-gray-200 rounded p-2">
                          <span className="font-medium">Notes:</span> {selectedDispute.manager_notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI info */}
                  {selectedDispute.scoring_guide && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scoring Guide</div>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{selectedDispute.scoring_guide}</p>
                    </div>
                  )}

                  {/* Final score form */}
                  <form onSubmit={handleResolve} className="space-y-4 border-t border-gray-200 pt-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Final Score <span className="text-red-500">*</span>
                      </label>
                      {(() => {
                        const opts = getScoreOptions(selectedDispute.score_type);
                        if (opts) {
                          return (
                            <div className="flex gap-2 flex-wrap">
                              {opts.map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setFinalScore(String(v))}
                                  className={`w-12 h-12 rounded-lg font-bold text-sm border-2 transition-colors ${
                                    finalScore === String(v)
                                      ? 'bg-gray-900 border-gray-900 text-white'
                                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-600'
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={finalScore}
                            onChange={e => setFinalScore(e.target.value)}
                            className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            placeholder="0–100"
                          />
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Reconciliation Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                        placeholder="Explain your decision (optional but recommended)…"
                      />
                    </div>

                    {submitError && (
                      <p className="text-sm text-red-600">{submitError}</p>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={submitting || finalScore === ''}
                        className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
                      >
                        {submitting ? 'Submitting…' : 'Submit Final Score'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
