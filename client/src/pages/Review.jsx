import { useState, useEffect, useRef } from 'react';
import { useSearchParamState } from '../lib/useSearchParamState';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getActivePeriods, getReportsSummary, getReportScores, submitManagerScores,
} from '../lib/api';
import {
  Scale, CheckCircle2, AlertCircle, Users,
  ArrowLeft, Download,
} from 'lucide-react';
import { downloadCsv } from '../lib/csvExport';
import ReportCard from '../components/review/ReportCard';
import ReviewRow from '../components/review/ReviewRow';
import DisputesTab from '../components/review/DisputesTab';
import ConfirmModal from '../components/ConfirmModal';
import { SkeletonTable } from '../components/Skeleton';

// ── Main Review Component ──────────────────────────────────────────────────────

export default function Review() {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const isAdmin = !!employee?.is_admin;

  const [activeTab, setActiveTab] = useSearchParamState('tab', 'team');
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useSearchParamState('period', '');
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [localScores, setLocalScores] = useState({});
  const [localNotes, setLocalNotes]   = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const containerRef = useRef(null);
  const rightPanelRef = useRef(null);
  const pendingAlignRef = useRef(null);

  const handleSelectReport = (report, tileEl) => {
    if (tileEl) {
      pendingAlignRef.current = tileEl.getBoundingClientRect().top;
    }
    setSelectedReport(report);
  };

  useEffect(() => {
    getActivePeriods().then(ps => {
      setPeriods(ps);
      if (ps.length > 0 && !selectedPeriodId) setSelectedPeriodId(String(ps[0].id));
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) return;
    setSelectedReport(null);
    setReviewData(null);
    setLoading(true);
    getReportsSummary(selectedPeriodId)
      .then(setReports)
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [selectedPeriodId]);

  useEffect(() => {
    if (!selectedReport || pendingAlignRef.current === null) return;
    requestAnimationFrame(() => {
      if (rightPanelRef.current && containerRef.current) {
        const panelTop = rightPanelRef.current.getBoundingClientRect().top;
        const tileTop = pendingAlignRef.current;
        containerRef.current.scrollTop += panelTop - tileTop;
        pendingAlignRef.current = null;
      }
    });
  }, [selectedReport]);

  useEffect(() => {
    if (!selectedReport || !selectedPeriodId) return;
    setLoading(true);
    setLocalScores({});
    setLocalNotes({});
    getReportScores(selectedPeriodId, selectedReport.id)
      .then(setReviewData)
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [selectedReport, selectedPeriodId]);

  const handleBulkApprove = () => {
    if (!reviewData) return;
    const newScores = {};
    reviewData.items.forEach(item => {
      if (item.template.is_externally_scored) return;
      if (item.score?.is_aggregated) return;
      if (item.score?.self_score !== null && item.score?.self_score !== undefined
          && item.template.score_type !== 'raw_100'
          && item.score?.status !== 'reconciled') {
        newScores[item.template.id] = item.score.self_score;
      }
    });
    setLocalScores(newScores);
  };

  const handleSubmit = async () => {
    if (!reviewData || !selectedReport) return;
    setError('');
    setSubmitting(true);

    const scores = reviewData.items
      .filter(item => !item.template.is_externally_scored)
      .filter(item => !item.score?.is_aggregated)
      .filter(item => item.template.score_type !== 'raw_100')
      .filter(item => item.score?.status !== 'reconciled')
      .map(item => {
        const tid = item.template.id;
        const localVal = localScores[tid];
        const existingManager = item.score?.manager_score;
        const managerScore = localVal !== undefined ? localVal : existingManager;
        if (managerScore === null || managerScore === undefined) return null;
        return {
          kpi_template_id: tid,
          manager_score: managerScore,
          manager_notes: localNotes[tid] !== undefined ? localNotes[tid] : (item.score?.manager_notes || ''),
        };
      })
      .filter(Boolean);

    if (scores.length === 0) {
      showToast('Enter at least one manager score before submitting.', 'error');
      setSubmitting(false);
      return;
    }

    try {
      const result = await submitManagerScores(selectedPeriodId, selectedReport.id, scores);
      setReviewData(prev => ({ ...prev, items: result.items }));
      setLocalScores({});
      setLocalNotes({});
      showToast('Manager scores submitted!');
      getReportsSummary(selectedPeriodId).then(setReports);
    } catch (e) {
      showToast(e.response?.data?.error || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    function handleKey(e) {
      if (!reports.length) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = selectedReport ? reports.findIndex(r => r.id === selectedReport.id) : -1;
        const next = reports[idx + 1];
        if (next) setSelectedReport(next);
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = selectedReport ? reports.findIndex(r => r.id === selectedReport.id) : reports.length;
        const prev = reports[idx - 1];
        if (prev) setSelectedReport(prev);
      }
      if (e.key === 'Escape') {
        setSelectedReport(null);
        setReviewData(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reports, selectedReport]);

  const grouped = {};
  if (reviewData?.items) {
    for (const item of reviewData.items) {
      const attr = item.template.attribute_name;
      if (!grouped[attr]) grouped[attr] = [];
      grouped[attr].push(item);
    }
  }

  const hasUnsaved = Object.keys(localScores).length > 0;

  function handleExportCsv() {
    if (!reviewData || !selectedReport) return;
    const rows = reviewData.items.map(item => ({
      Employee: selectedReport.name,
      Role: selectedReport.role_name,
      Attribute: item.template.attribute_name,
      KPI: item.template.sub_metric_name,
      Weight: item.template.weight_percentage,
      SelfScore: item.score?.self_score ?? '',
      ManagerScore: item.score?.manager_score ?? '',
      FinalScore: item.score?.final_score ?? '',
      Status: item.score?.status ?? 'pending',
      Notes: item.score?.manager_notes ?? '',
    }));
    downloadCsv(rows, `review-${selectedReport.name.replace(/\s+/g, '-')}`);
  }

  const filteredReports = reports.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.role_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="p-5 overflow-y-auto flex-1">
      <div className="mb-4">
        <h1 className="text-sm font-semibold text-gray-900">Manager Review</h1>
        <p className="text-xs text-gray-400 mt-0.5">Review scores, enter manager scores, and resolve disputes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('team')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'team' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Team Scores
        </button>
        <button
          onClick={() => setActiveTab('disputes')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'disputes' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Disputes
        </button>
      </div>

      {/* ── Team Scores Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'team' && (
        <>
          {/* Period selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Scoring Period</label>
            {periods.length === 0 ? (
              <p className="text-sm text-gray-400">No active periods.</p>
            ) : (
              <select
                value={selectedPeriodId}
                onChange={e => { setSelectedPeriodId(e.target.value); setSelectedReport(null); }}
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.label} ({p.period_type})</option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-5">
            <div className={`${selectedReport ? 'lg:w-64 shrink-0' : 'flex-1'}`}>
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-gray-400" />
                <div>
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    {isAdmin ? `All Employees (${reports.length})` : `Direct Reports (${reports.length})`}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Use ↑↓ arrow keys to navigate · Esc to close</p>
                </div>
              </div>

              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />

              {loading && !reviewData && (
                <SkeletonTable rows={4} />
              )}

              {!loading && reports.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <Users size={28} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-500">No KPIs found for this period</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isAdmin
                      ? 'No employees have scores for the selected period.'
                      : 'No direct reports have submitted scores for the selected period.'}
                  </p>
                </div>
              )}

              <div className={`space-y-2 ${selectedReport ? '' : 'max-w-2xl'}`}>
                {filteredReports.map(r => (
                  <div
                    key={r.id}
                    className={selectedReport?.id === r.id ? 'ring-2 ring-gray-900 rounded-xl' : ''}
                  >
                    <ReportCard report={r} onSelect={handleSelectReport} />
                  </div>
                ))}
              </div>
            </div>

            {selectedReport && (
              <div ref={rightPanelRef} className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedReport(null); setReviewData(null); }}
                      className="text-gray-400 hover:text-gray-700 p-1"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div>
                      <h2 className="font-semibold text-gray-900 text-sm">{selectedReport.name}</h2>
                      <p className="text-xs text-gray-400">{selectedReport.role_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportCsv}
                      disabled={!reviewData}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      <Download size={13} />
                      Export CSV
                    </button>
                    {!isAdmin && (
                      <button
                        onClick={handleBulkApprove}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Approve All Self-Scores
                      </button>
                    )}
                  </div>
                </div>

                {loading ? (
                  <SkeletonTable rows={5} />
                ) : reviewData ? (
                  <>
                    <div className="space-y-6 pb-24">
                      {Object.entries(grouped).map(([attr, items]) => (
                        <div key={attr}>
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                            {attr}
                          </h3>
                          <div className="space-y-3">
                            {items.map(item => (
                              <ReviewRow
                                key={item.template.id}
                                item={item}
                                localScore={localScores[item.template.id]}
                                localNotes={localNotes[item.template.id]}
                                onScoreChange={(tid, v) => setLocalScores(s => ({ ...s, [tid]: v }))}
                                onNotesChange={(tid, v) => setLocalNotes(n => ({ ...n, [tid]: v }))}
                                submitting={submitting}
                                readOnly={isAdmin}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {!isAdmin && (
                      <div className="sticky bottom-0 mt-5 bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-lg">
                        <span className="text-sm text-gray-500">
                          {hasUnsaved
                            ? <span className="text-gray-700 font-medium">● Unsaved changes</span>
                            : 'No pending changes'}
                        </span>
                        <button
                          onClick={() => setConfirmSubmit(true)}
                          disabled={submitting || !hasUnsaved}
                          className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          <CheckCircle2 size={15} />
                          {submitting ? 'Submitting…' : 'Submit Manager Scores'}
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Disputes Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'disputes' && (
        <>
          {selectedPeriodId && periods.length > 0 && (
            <div className="mb-4 text-xs text-gray-400 flex items-center gap-1.5">
              <span>Showing disputes for all periods you can reconcile</span>
            </div>
          )}
          <DisputesTab />
        </>
      )}

      <ConfirmModal
        open={confirmSubmit}
        title="Submit Manager Scores?"
        message={`This will submit scores for ${selectedReport?.name}. They will be notified of any disputes.`}
        confirmLabel="Submit"
        onConfirm={() => { setConfirmSubmit(false); handleSubmit(); }}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}
