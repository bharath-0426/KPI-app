import { useState, useEffect } from 'react';
import { getTeamRatings, submitTeamRatings } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Star, CheckCircle2, AlertCircle, Users, RefreshCw, Eye, Download } from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker';
import { downloadCsv } from '../lib/csvExport';
import ConfirmModal from '../components/ConfirmModal';
import { SkeletonTable } from '../components/Skeleton';

function getOptions(scoreType) {
  if (scoreType === 'scale_2_5')  return [2, 3, 4, 5];
  if (scoreType === 'scale_1_5')  return [1, 2, 3, 4, 5];
  if (scoreType === 'scale_1_10') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return null;
}

function ScoreCell({ template, currentScore, existingScore, onChange, readOnly }) {
  const opts = getOptions(template.score_type);
  const isReconciled = existingScore?.status === 'reconciled';
  const displayScore = existingScore?.final_score ?? existingScore?.manager_score ?? null;

  if (isReconciled) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm font-bold text-gray-900">{existingScore.final_score}</span>
        <CheckCircle2 size={12} className="text-gray-400 ml-1" />
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="flex items-center justify-center h-full">
        {displayScore !== null ? (
          <span className="text-sm font-semibold text-gray-700">{displayScore}</span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </div>
    );
  }

  if (opts) {
    return (
      <div className="flex gap-1.5 flex-wrap justify-center">
        {opts.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v === currentScore ? null : v)}
            className={`min-w-[2rem] min-h-[2rem] w-8 h-8 rounded text-xs font-semibold border transition-all touch-manipulation ${
              currentScore === v
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }

  // Raw / free input
  return (
    <input
      type="number"
      min="0"
      max="100"
      step="0.1"
      value={currentScore ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      placeholder="—"
      className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
    />
  );
}

export default function RatingsForTeam() {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const isAdmin = !!employee?.is_admin;

  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [search, setSearch] = useState('');

  const [teamData, setTeamData] = useState(null); // { employees, templates, period, scorer_frequencies }
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  // localScores[employeeId][templateId] = score value
  const [localScores, setLocalScores] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Load team data when period changes
  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingData(true);
    setDataError('');
    setLocalScores({});
    getTeamRatings(selectedPeriod.id)
      .then(data => setTeamData(data))
      .catch(e => setDataError(e.response?.data?.error || 'Failed to load team data'))
      .finally(() => setLoadingData(false));
  }, [selectedPeriod]);

  function handleExportCsv() {
    const rows = [];
    for (const emp of employees) {
      for (const t of templates) {
        const existing = getExistingScore(emp, t.id);
        if (!(t.id in (emp.scores || {}))) continue;
        rows.push({
          Employee: emp.name,
          Role: emp.role_name,
          Attribute: t.attribute_name,
          KPI: t.sub_metric_name,
          Weight: t.weight_percentage,
          Score: existing?.final_score ?? existing?.manager_score ?? '',
          Status: existing?.status ?? 'pending',
        });
      }
    }
    downloadCsv(rows, `ratings-${selectedPeriod?.label || 'export'}`);
  }

  function refreshData() {
    if (!selectedPeriod) return;
    setLoadingData(true);
    setDataError('');
    setLocalScores({});
    getTeamRatings(selectedPeriod.id)
      .then(data => setTeamData(data))
      .catch(e => setDataError(e.response?.data?.error || 'Failed to load team data'))
      .finally(() => setLoadingData(false));
  }

  function setScore(empId, templateId, value) {
    setLocalScores(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [templateId]: value },
    }));
  }

  function getScore(empId, templateId) {
    return localScores[empId]?.[templateId];
  }

  function getExistingScore(emp, templateId) {
    return emp.scores?.[templateId] || null;
  }

  const hasAnyChanges = Object.values(localScores).some(
    empScores => Object.values(empScores).some(v => v !== null && v !== undefined)
  );

  async function handleSubmit() {
    if (!selectedPeriod || !teamData) return;
    setSubmitting(true);

    const ratings = [];
    for (const [empIdStr, empScores] of Object.entries(localScores)) {
      const employee_id = parseInt(empIdStr);
      for (const [tidStr, final_score] of Object.entries(empScores)) {
        if (final_score === null || final_score === undefined) continue;
        ratings.push({ employee_id, kpi_template_id: parseInt(tidStr), final_score });
      }
    }

    if (ratings.length === 0) {
      showToast('Enter at least one score before submitting.', 'error');
      setSubmitting(false);
      return;
    }

    try {
      await submitTeamRatings(selectedPeriod.id, ratings);
      showToast(`${ratings.length} score${ratings.length > 1 ? 's' : ''} submitted successfully!`);
      setLocalScores({});
      // Reload to reflect reconciled status
      const data = await getTeamRatings(selectedPeriod.id);
      setTeamData(data);
    } catch (e) {
      showToast(e.response?.data?.error || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const { employees = [], templates = [] } = teamData || {};

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Group templates by attribute
  const attrGroups = [];
  const seenAttrs = {};
  for (const t of templates) {
    if (!seenAttrs[t.attribute_name]) {
      seenAttrs[t.attribute_name] = [];
      attrGroups.push({ name: t.attribute_name, templates: seenAttrs[t.attribute_name] });
    }
    seenAttrs[t.attribute_name].push(t);
  }

  const pendingRatingsCount = Object.values(localScores).reduce(
    (total, empScores) => total + Object.values(empScores).filter(v => v !== null && v !== undefined).length,
    0
  );

  return (
    <div className="p-5 overflow-y-auto flex-1 pb-24">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Ratings for Team</h1>
            <p className="text-sm text-gray-400">
              {isAdmin ? 'View all external KPI ratings across the organisation' : 'Rate your team on externally-scored KPIs'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!teamData || employees.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            onClick={refreshData}
            disabled={loadingData || !selectedPeriod}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={loadingData ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Period Picker */}
      <PeriodPicker selected={selectedPeriod} onSelect={setSelectedPeriod} />

      {/* Messages */}
      {dataError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={15} /> {dataError}
        </div>
      )}

      {loadingData && (
        <SkeletonTable rows={6} />
      )}

      {!loadingData && !dataError && teamData && employees.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm">No KPIs found for this period</p>
          {!isAdmin && teamData.scorer_frequencies?.length > 0 ? (
            <p className="text-xs text-gray-400 mt-1">
              Your externally-scored KPIs use{' '}
              <span className="font-medium text-gray-600 capitalize">
                {teamData.scorer_frequencies.join(', ')}
              </span>{' '}
              frequency — switch to that period type above.
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              {isAdmin
                ? 'No externally-scored KPI templates are configured for this period type.'
                : 'No externally-scored KPI templates are assigned to your role for the selected period.'}
            </p>
          )}
        </div>
      )}

      {!loadingData && employees.length > 0 && templates.length > 0 && (
        <>
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-64"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {/* Attribute group headers */}
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide w-48 sticky left-0 bg-gray-50 border-r border-gray-200">
                      Employee
                    </th>
                    {attrGroups.map(g => (
                      <th
                        key={g.name}
                        colSpan={g.templates.length}
                        className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide text-center border-r border-gray-200 last:border-r-0"
                      >
                        {g.name}
                      </th>
                    ))}
                  </tr>
                  {/* Template name sub-headers */}
                  <tr className="bg-white border-b border-gray-200">
                    <th className="sticky left-0 bg-white border-r border-gray-200 px-4 py-2" />
                    {templates.map(t => (
                      <th
                        key={t.id}
                        className="px-3 py-2 text-xs font-semibold text-gray-700 text-center max-w-28 border-r border-gray-100 last:border-r-0"
                      >
                        <div className="truncate" title={t.sub_metric_name}>{t.sub_metric_name}</div>
                        <div className="text-gray-400 font-normal mt-0.5">{t.weight_percentage}%</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, i) => (
                    <tr key={emp.id} className={`group border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className={`sticky left-0 px-4 py-3 border-r border-gray-200 transition-colors group-hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <div className="font-semibold text-gray-900 text-sm">{emp.name}</div>
                        <div className="text-xs text-gray-400">{emp.role_name}</div>
                      </td>
                      {templates.map(t => {
                        const existing = getExistingScore(emp, t.id);
                        const applicable = emp.scores && t.id in emp.scores;

                        if (!applicable) {
                          return (
                            <td key={t.id} className="px-3 py-3 text-center border-r border-gray-100 last:border-r-0">
                              <span className="text-gray-300 text-xs">—</span>
                            </td>
                          );
                        }

                        return (
                          <td key={t.id} className="px-3 py-3 text-center border-r border-gray-100 last:border-r-0">
                            <ScoreCell
                              template={t}
                              currentScore={getScore(emp.id, t.id)}
                              existingScore={existing}
                              onChange={v => setScore(emp.id, t.id, v)}
                              readOnly={isAdmin}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit bar — hidden for admin (read-only view) */}
          {!isAdmin && (
            <div className="sticky bottom-0 bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-lg">
              <span className="text-sm text-gray-500">
                {hasAnyChanges
                  ? <span className="text-gray-700 font-medium">● Unsaved ratings</span>
                  : 'Select scores to rate your team'}
              </span>
              <button
                onClick={() => setConfirmSubmit(true)}
                disabled={submitting || !hasAnyChanges}
                className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <CheckCircle2 size={15} />
                {submitting ? 'Submitting…' : 'Submit Ratings'}
              </button>
            </div>
          )}
          {isAdmin && (
            <div className="sticky bottom-0 bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 flex items-center gap-2 shadow-lg">
              <Eye size={15} className="text-gray-400" />
              <span className="text-sm text-gray-600 font-medium">Admin view — read only</span>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmSubmit}
        title="Submit Ratings?"
        message={`This will submit ${pendingRatingsCount} rating${pendingRatingsCount !== 1 ? 's' : ''} for your team.`}
        confirmLabel="Submit"
        onConfirm={() => { setConfirmSubmit(false); handleSubmit(); }}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}
