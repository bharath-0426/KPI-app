import { useState, useEffect } from 'react';
import { getActivePeriods, getDistributorFrequencies, getDistribution, saveDistribution } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { IndianRupee, AlertCircle, Eye, Download } from 'lucide-react';
import { downloadCsv } from '../lib/csvExport';
import ConfirmModal from '../components/ConfirmModal';

const FREQ_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

export default function Distribution() {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const isAdmin = !!employee?.is_admin;

  const [frequencies,    setFrequencies]    = useState([]);
  const [activeFreq,     setActiveFreq]     = useState(null);   // selected tab
  const [periodsByFreq,  setPeriodsByFreq]  = useState({});     // { monthly: [...], quarterly: [...] }
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [initLoading,    setInitLoading]    = useState(true);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [state,   setState]   = useState({});
  const [confirmSave, setConfirmSave] = useState(null); // templateId to save or null

  // Load frequencies + active periods once
  useEffect(() => {
    Promise.all([getDistributorFrequencies(), getActivePeriods()])
      .then(([freqs, allPeriods]) => {
        const byFreq = {};
        freqs.forEach(f => {
          byFreq[f] = allPeriods.filter(p => p.period_type === f);
        });
        setFrequencies(freqs);
        setPeriodsByFreq(byFreq);
        // Default to first frequency that has active periods; fallback to first freq
        const first = freqs.find(f => byFreq[f].length > 0) || freqs[0] || null;
        setActiveFreq(first);
        if (first && byFreq[first]?.length > 0) setSelectedPeriod(byFreq[first][0]);
      })
      .catch(() => {})
      .finally(() => setInitLoading(false));
  }, []);

  // When user switches frequency tab, auto-select first period of that type
  function handleFreqChange(freq) {
    setActiveFreq(freq);
    const ps = periodsByFreq[freq] || [];
    setSelectedPeriod(ps.length > 0 ? ps[0] : null);
  }

  useEffect(() => {
    if (!selectedPeriod) { setData(null); setState({}); return; }
    setLoading(true);
    setError('');
    setData(null);
    setState({});
    getDistribution(selectedPeriod.id)
      .then(d => {
        setData(d);
        const initial = {};
        d.groups.forEach(g => {
          initial[g.kpi_template.id] = {
            allocations: g.allocations.map(a => ({ ...a })),
            saving: false,
            saveError: '',
          };
        });
        setState(initial);
      })
      .catch(() => setError('Failed to load distribution data.'))
      .finally(() => setLoading(false));
  }, [selectedPeriod]);

  function setAmount(templateId, employeeId, value) {
    const num = value === '' ? 0 : Math.max(0, Math.min(100, parseInt(value) || 0));
    setState(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        allocations: prev[templateId].allocations.map(a =>
          a.employee_id === employeeId ? { ...a, amount: num } : a
        ),
        saveError: '',
      },
    }));
  }

  function getTotal(templateId) {
    return (state[templateId]?.allocations ?? []).reduce((s, a) => s + (a.amount || 0), 0);
  }

  async function handleSave(templateId) {
    const total = getTotal(templateId);
    if (total !== 100) {
      setState(prev => ({
        ...prev,
        [templateId]: { ...prev[templateId], saveError: `Total must be exactly 100 (currently ${total})` },
      }));
      return;
    }
    setState(prev => ({ ...prev, [templateId]: { ...prev[templateId], saving: true, saveError: '' } }));
    try {
      const result = await saveDistribution(
        selectedPeriod.id,
        templateId,
        state[templateId].allocations.map(a => ({ employee_id: a.employee_id, amount: a.amount }))
      );
      const newState = {};
      result.groups.forEach(g => {
        newState[g.kpi_template.id] = {
          allocations: g.allocations.map(a => ({ ...a })),
          saving: false,
          saveError: '',
        };
      });
      setData(prev => ({ ...prev, groups: result.groups }));
      setState(newState);
      showToast('Distribution saved successfully!');
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to save.';
      setState(prev => ({ ...prev, [templateId]: { ...prev[templateId], saving: false, saveError: msg } }));
    }
  }

  function handleExportCsv() {
    if (!data) return;
    const rows = [];
    for (const g of data.groups) {
      for (const a of g.allocations) {
        rows.push({
          KPI: g.kpi_template.sub_metric_name,
          Attribute: g.kpi_template.attribute_name,
          Employee: a.employee_name,
          Role: a.role_name,
          Amount: a.amount,
          Total: g.total,
          Submitted: g.is_submitted ? 'Yes' : 'No',
        });
      }
    }
    downloadCsv(rows, `distribution-${selectedPeriod?.label || 'export'}`);
  }

  return (
    <div className="p-5 overflow-y-auto flex-1">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">₹100 Distribution</h1>
          <p className="text-xs text-gray-400 mt-0.5">Distribute ₹100 among your direct reports for each applicable KPI</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={!data || data.groups.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Period selector */}
      {initLoading ? (
        <div className="text-sm text-gray-400 mb-5">Loading…</div>
      ) : frequencies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5 text-sm text-gray-500">
          {isAdmin ? 'No ₹100 distribution KPI templates are configured.' : 'No ₹100 distribution KPIs are assigned to your role.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex items-center gap-4 flex-wrap">
          {/* Frequency tabs — only shown if user has >1 frequency */}
          {frequencies.length > 1 && (
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {frequencies.map(f => (
                <button
                  key={f}
                  onClick={() => handleFreqChange(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeFreq === f
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {FREQ_LABEL[f] || f}
                </button>
              ))}
            </div>
          )}
          {/* Period dropdown for the selected frequency */}
          {activeFreq && (
            <div className="flex items-center gap-2">
              {frequencies.length === 1 && (
                <span className="text-sm font-medium text-gray-500">{FREQ_LABEL[activeFreq] || activeFreq}</span>
              )}
              {(periodsByFreq[activeFreq] || []).length === 0 ? (
                <span className="text-sm text-gray-400">No active periods</span>
              ) : (
                <select
                  value={selectedPeriod?.id ?? ''}
                  onChange={e => {
                    const p = (periodsByFreq[activeFreq] || []).find(p => p.id === parseInt(e.target.value));
                    if (p) setSelectedPeriod(p);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {(periodsByFreq[activeFreq] || []).map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          Loading…
        </div>
      )}

      {!loading && data && data.groups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <IndianRupee size={28} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm">No ₹100 KPIs found for this period</p>
          <p className="text-xs text-gray-400 mt-1">
            {data.distributor_frequencies?.length > 0
              ? `₹100 distribution KPIs use ${data.distributor_frequencies.join(', ')} frequency — switch to that period type above.`
              : 'No ₹100 distribution KPI templates are configured for this period type.'}
          </p>
        </div>
      )}

      {/* ── Admin read-only view ─────────────────────────────────────────── */}
      {!loading && isAdmin && data && data.groups.length > 0 && (
        <div className="space-y-4">
          {(() => {
            // Group by distributor
            const byDist = {};
            data.groups.forEach(g => {
              const key = g.distributor?.id ?? 'unknown';
              if (!byDist[key]) byDist[key] = { distributor: g.distributor, groups: [] };
              byDist[key].groups.push(g);
            });
            return Object.values(byDist).map(({ distributor, groups }) => (
              <div key={distributor?.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <Eye size={14} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">{distributor?.name}</span>
                  <span className="text-xs text-gray-400">· {distributor?.role_name}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {groups.map(g => {
                    const tmpl = g.kpi_template;
                    const total = g.total;
                    const isComplete = total === 100;
                    return (
                      <div key={tmpl.id} className="px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              {tmpl.attribute_name}
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">{tmpl.sub_metric_name}</h3>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            isComplete
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            ₹{total} / 100
                          </span>
                        </div>
                        <div className="space-y-2">
                          {g.allocations.map(a => (
                            <div key={a.employee_id} className="flex items-center justify-between text-sm">
                              <div>
                                <span className="font-medium text-gray-800">{a.employee_name}</span>
                                <span className="text-gray-400 text-xs ml-2">{a.role_name}</span>
                              </div>
                              <span className={`font-semibold ${a.amount > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                                ₹{a.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      <ConfirmModal
        open={confirmSave !== null}
        title="Save Distribution?"
        message="Distributions are saved and scores updated for your team."
        confirmLabel="Save"
        onConfirm={() => { const id = confirmSave; setConfirmSave(null); handleSave(id); }}
        onCancel={() => setConfirmSave(null)}
      />

      {/* ── Normal distributor interactive view ─────────────────────────── */}
      {!loading && !isAdmin && data && data.groups.length > 0 && (
        <div className="space-y-6">
          {data.groups.map(g => {
            const tmpl = g.kpi_template;
            const localState = state[tmpl.id];
            if (!localState) return null;
            const total = getTotal(tmpl.id);
            const isComplete = total === 100;
            const saved = g.is_submitted;

            return (
              <div key={tmpl.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                      {tmpl.attribute_name}
                    </div>
                    <h2 className="text-base font-semibold text-gray-900">{tmpl.sub_metric_name}</h2>
                    {tmpl.measurement_description && (
                      <p className="text-xs text-gray-400 mt-0.5">{tmpl.measurement_description}</p>
                    )}
                  </div>
                  {saved && (
                    <span className="text-xs bg-gray-100 text-gray-600 font-semibold px-3 py-1 rounded-full border border-gray-200">
                      Saved ✓
                    </span>
                  )}
                </div>

                <div className="px-6 py-4">
                  <div className="space-y-3">
                    {localState.allocations.map(a => (
                      <div key={a.employee_id} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{a.employee_name}</div>
                          <div className="text-xs text-gray-400">{a.role_name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">₹</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={a.amount === 0 ? '' : a.amount}
                            onChange={e => setAmount(tmpl.id, a.employee_id, e.target.value)}
                            placeholder="0"
                            className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Total</span>
                      <span className={`text-lg font-bold ${
                        isComplete ? 'text-gray-900' : total > 100 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        ₹{total} / 100
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          isComplete ? 'bg-gray-900' : total > 100 ? 'bg-red-500' : 'bg-gray-400'
                        }`}
                        style={{ width: `${Math.min(total, 100)}%` }}
                      />
                    </div>
                  </div>

                  {localState.saveError && (
                    <p className="mt-3 text-sm text-red-600">{localState.saveError}</p>
                  )}

                  <button
                    onClick={() => isComplete && setConfirmSave(tmpl.id)}
                    disabled={localState.saving || !isComplete}
                    className="mt-4 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    {localState.saving ? 'Saving…' : isComplete ? 'Save Distribution' : `Need ₹${100 - total} more`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
