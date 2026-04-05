import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { BarChart2, ChevronRight, Home, ArrowLeft, Users, Target, Filter, Download } from 'lucide-react';
import { downloadCsv } from '../lib/csvExport';
import {
  getReportPeriods,
  getDrillDepartments, getDrillDeptRoles,
  getDrillRoleKpis, getDrillRoleEmployees,
  getDrillKpiEmployees, getDrillEmployeeKpis,
  getDepartments, getFrequencies,
} from '../lib/api';

const COLORS = [
  '#111827', '#374151', '#4b5563', '#6b7280',
  '#9ca3af', '#111827', '#374151', '#4b5563',
  '#6b7280', '#9ca3af', '#111827', '#374151',
];

// ── Slide animation wrapper ───────────────────────────────────────────────────
function SlideIn({ slideKey, dir, children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offset = dir === 'forward' ? 36 : -36;
    el.style.cssText = `opacity:0;transform:translateX(${offset}px);transition:none`;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!ref.current) return;
        el.style.cssText = 'opacity:1;transform:translateX(0);transition:opacity 0.22s ease,transform 0.22s ease';
      })
    );
    return () => cancelAnimationFrame(id);
  }, [slideKey]); // eslint-disable-line
  return <div ref={ref}>{children}</div>;
}

// ── Custom X-axis tick (rotated labels) ───────────────────────────────────────
function CustomTick({ x, y, payload }) {
  const text = payload.value;
  const truncated = text.length > 20 ? text.slice(0, 18) + '\u2026' : text;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={10}
        textAnchor="end" fontSize={12} fill="#6b7280"
        transform="rotate(-38)"
      >
        {truncated}
      </text>
    </g>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function DrillTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xl text-sm min-w-36">
      <p className="font-semibold text-gray-800 truncate max-w-48">{d.label}</p>
      {d.employee_code && (
        <p className="text-xs text-gray-400 font-mono mb-1.5">{d.employee_code}</p>
      )}
      {!d.employee_code && <div className="mb-1.5" />}
      {d.avg_pct != null
        ? (
          <p className="text-2xl font-bold text-gray-900">
            {d.avg_pct.toFixed(1)}<span className="text-sm font-medium text-gray-400">%</span>
          </p>
        )
        : <p className="text-gray-400 text-xs">No scores yet</p>
      }
      {d.emp_count != null && (
        <p className="text-xs text-gray-400 mt-1.5">
          {d.scored_count ?? 0} / {d.emp_count} employees scored
        </p>
      )}
      {d.kpi_count != null && (
        <p className="text-xs text-gray-400 mt-1.5">
          {d.scored_count} / {d.kpi_count} KPIs scored
        </p>
      )}
      {d.raw_score != null && (
        <p className="text-xs text-gray-400 mt-1">Raw: {d.raw_score}</p>
      )}
      {d.self_score != null && (
        <p className="text-xs text-gray-400">
          Self: {d.self_score} &middot; Mgr: {d.manager_score ?? '\u2014'}
        </p>
      )}
    </div>
  );
}

// ── Main chart component ──────────────────────────────────────────────────────
function DrillChart({ items, onBarClick, isLeaf, loading }) {
  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center">
        <div className="flex gap-1.5 items-center text-gray-400 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="h-72 flex flex-col items-center justify-center text-gray-400 gap-3">
        <BarChart2 size={36} className="text-gray-200" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No data for this period</p>
          <p className="text-xs text-gray-400 mt-0.5">Try selecting a different period</p>
        </div>
      </div>
    );
  }

  const data = items.map(item => ({ ...item, displayPct: item.avg_pct ?? 0 }));
  const barSize = Math.min(80, Math.max(18, Math.floor(1100 / data.length) - 14));

  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={data} margin={{ top: 32, right: 24, bottom: 80, left: 4 }} barSize={barSize}>
        <XAxis
          dataKey="label"
          interval={0}
          tick={<CustomTick />}
          tickLine={false}
          axisLine={{ stroke: '#f3f4f6' }}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={v => `${v}%`}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<DrillTooltip />} cursor={{ fill: '#f9fafb', radius: 6 }} />
        <Bar
          dataKey="displayPct"
          radius={[6, 6, 0, 0]}
          cursor={isLeaf ? 'default' : 'pointer'}
          onClick={isLeaf ? undefined : (d) => onBarClick(d)}
        >
          <LabelList
            content={({ x, y, width, index }) => {
              const item = data[index];
              const lbl = item.avg_pct != null ? `${Math.round(item.avg_pct)}%` : '\u2014';
              return (
                <text
                  x={x + width / 2} y={y - 7}
                  textAnchor="middle" fontSize={11}
                  fill={item.avg_pct != null ? '#374151' : '#d1d5db'}
                  fontWeight={item.avg_pct != null ? 600 : 400}
                >
                  {lbl}
                </text>
              );
            }}
          />
          {data.map((item, i) => (
            <Cell
              key={i}
              fill={item.avg_pct != null ? COLORS[i % COLORS.length] : '#e5e7eb'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ stack, onCrumbClick }) {
  return (
    <nav className="flex items-center gap-0.5 flex-wrap min-h-8">
      <button
        onClick={() => onCrumbClick(-1)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
          stack.length === 0
            ? 'bg-gray-900 text-white font-medium'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
        }`}
      >
        <Home size={13} /> All Departments
      </button>
      {stack.map((item, i) => (
        <React.Fragment key={i}>
          <ChevronRight size={14} className="text-gray-300 mx-0.5 shrink-0" />
          <button
            onClick={() => onCrumbClick(i)}
            className={`px-2.5 py-1.5 rounded-lg text-sm transition-colors max-w-44 truncate ${
              i === stack.length - 1
                ? 'bg-gray-900 text-white font-medium'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
            title={item.label}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const [periods,       setPeriods]       = useState([]);
  const [periodId,      setPeriodId]      = useState('');
  const [periodType,    setPeriodType]    = useState('');   // active tab filter
  const [freqTypes,     setFreqTypes]     = useState([]);
  const [departments,   setDepartments]   = useState([]);
  const [deptRoles,     setDeptRoles]     = useState([]);   // roles for selected dept
  const [stack,         setStack]         = useState([]);
  const [viewMode,      setViewMode]      = useState('kpi');
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [slideDir,      setSlideDir]      = useState('forward');
  const [slideKey,      setSlideKey]      = useState(0);

  // ── Bootstrap data ──────────────────────────────────────────────────────────
  useEffect(() => {
    getFrequencies().then(setFreqTypes).catch(() => {});
    getDepartments().then(setDepartments).catch(() => {});
    getReportPeriods()
      .then(ps => {
        const sorted = [...ps].sort((a, b) => b.start_date.localeCompare(a.start_date));
        setPeriods(sorted);
        if (sorted.length > 0) {
          setPeriodId(sorted[0].id);
          setPeriodType(sorted[0].period_type);
        }
      })
      .catch(() => setError('Failed to load periods'));
  }, []);

  // ── When dept filter changes, load roles for that dept ──────────────────────
  const stackDeptItem = stack.find(s => s.type === 'dept');
  useEffect(() => {
    if (!stackDeptItem || !periodId) {
      setDeptRoles([]);
      return;
    }
    getDrillDeptRoles(stackDeptItem.id, periodId)
      .then(setDeptRoles)
      .catch(() => setDeptRoles([]));
  }, [stackDeptItem?.id, periodId]); // eslint-disable-line

  // ── Reload chart when period / stack / viewMode changes ─────────────────────
  useEffect(() => {
    if (!periodId) return;
    loadLevel();
  }, [periodId, stack, viewMode]); // eslint-disable-line

  async function loadLevel() {
    setLoading(true);
    setError('');
    try {
      const last = stack[stack.length - 1];
      let data;

      if (!last) {
        data = await getDrillDepartments(periodId);
      } else if (last.type === 'dept') {
        data = await getDrillDeptRoles(last.id, periodId);
      } else if (last.type === 'role') {
        data = viewMode === 'kpi'
          ? await getDrillRoleKpis(last.id, periodId)
          : await getDrillRoleEmployees(last.id, periodId);
      } else if (last.type === 'kpi') {
        data = await getDrillKpiEmployees(last.id, periodId);
      } else if (last.type === 'employee') {
        const res = await getDrillEmployeeKpis(last.id, periodId);
        data = res.kpis ?? res;
      }

      setItems(data || []);
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Navigation helpers ───────────────────────────────────────────────────────
  function navigate(newItem) {
    setSlideDir('forward');
    setSlideKey(k => k + 1);
    setStack(s => [...s, newItem]);
  }

  function handleBarClick(item) {
    const last = stack[stack.length - 1];
    if (!last) {
      navigate({ type: 'dept', id: item.id, label: item.label });
    } else if (last.type === 'dept') {
      navigate({ type: 'role', id: item.id, label: item.label });
    } else if (last.type === 'role') {
      navigate(viewMode === 'kpi'
        ? { type: 'kpi', id: item.id, label: item.label }
        : { type: 'employee', id: item.id, label: item.label, employee_code: item.employee_code }
      );
    } else if (last.type === 'kpi') {
      navigate({ type: 'employee', id: item.id, label: item.label, employee_code: item.employee_code });
    }
  }

  function handleCrumbClick(index) {
    setSlideDir('back');
    setSlideKey(k => k + 1);
    setStack(s => (index === -1 ? [] : s.slice(0, index + 1)));
  }

  function handleViewModeChange(mode) {
    if (mode === viewMode) return;
    setViewMode(mode);
    setSlideDir('forward');
    setSlideKey(k => k + 1);
  }

  // ── Filter bar handlers (set stack as shortcuts) ─────────────────────────────

  // Pop stack back to role level (removes kpi/employee sub-drill) on period type change
  function popToRoleLevel(currentStack) {
    const kpiEmpIdx = currentStack.findIndex(x => x.type === 'kpi' || x.type === 'employee');
    return kpiEmpIdx >= 0 ? currentStack.slice(0, kpiEmpIdx) : currentStack;
  }

  function handlePeriodTypeChange(type) {
    setPeriodType(type);
    // Jump to most recent period of this type
    const match = periods.find(p => p.period_type === type);
    if (match) {
      setSlideDir('forward');
      setSlideKey(k => k + 1);
      setPeriodId(match.id);
      // Pop any kpi/employee sub-drill — they may not be valid for the new period type
      setStack(s => popToRoleLevel(s));
    }
  }

  function handlePeriodChange(e) {
    const newId = e.target.value;
    const p = periods.find(x => String(x.id) === String(newId));
    const newType = p?.period_type;
    setPeriodId(newId);
    if (newType) setPeriodType(newType);
    setSlideDir('forward');
    setSlideKey(k => k + 1);
    // If period type changed, pop kpi/employee sub-drill
    if (newType && newType !== periodType) {
      setStack(s => popToRoleLevel(s));
    }
  }

  function handleDeptFilterChange(e) {
    const deptId = e.target.value;
    setSlideDir('forward');
    setSlideKey(k => k + 1);
    if (!deptId) {
      setStack([]);
    } else {
      const dept = departments.find(d => String(d.id) === String(deptId));
      setStack([{ type: 'dept', id: Number(deptId), label: dept?.name || deptId }]);
    }
  }

  function handleRoleFilterChange(e) {
    const roleId = e.target.value;
    setSlideDir('forward');
    setSlideKey(k => k + 1);
    if (!roleId) {
      // Pop back to dept level
      setStack(s => s.filter(x => x.type === 'dept'));
    } else {
      const role = deptRoles.find(r => String(r.id) === String(roleId));
      setStack(s => {
        const deptEntry = s.find(x => x.type === 'dept');
        return deptEntry
          ? [deptEntry, { type: 'role', id: Number(roleId), label: role?.label || roleId }]
          : [{ type: 'role', id: Number(roleId), label: role?.label || roleId }];
      });
    }
  }

  function handleExportCsv() {
    if (!items.length) return;
    const currentPeriodLabel = periods.find(p => String(p.id) === String(periodId))?.label || 'export';
    const rows = items.map(item => ({
      Label: item.label,
      Score: item.avg_pct != null ? item.avg_pct.toFixed(1) : '',
      EmployeeCode: item.employee_code || '',
      EmployeeCount: item.emp_count ?? '',
      ScoredCount: item.scored_count ?? '',
      Period: currentPeriodLabel,
    }));
    downloadCsv(rows, `report-${currentPeriodLabel}`);
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const last         = stack[stack.length - 1];
  const isAtRole     = last?.type === 'role';
  const isLeaf       = last?.type === 'employee';
  const canGoBack    = stack.length > 0;

  // Derive selected dept/role from stack for filter display
  const stackDept    = stack.find(s => s.type === 'dept');
  const stackRole    = stack.find(s => s.type === 'role');

  // Periods filtered by active period type tab
  const filteredPeriods = periodType
    ? periods.filter(p => p.period_type === periodType)
    : periods;

  const levelTitle = !last ? 'All Departments' : last.label;
  const levelSub = !last ? 'Overview across all departments'
    : last.type === 'dept' ? 'Roles within this department'
    : last.type === 'role' ? (viewMode === 'kpi' ? 'KPI metrics for this role' : 'Employees in this role')
    : last.type === 'kpi' ? 'Employee scores for this KPI'
    : 'KPI breakdown for this employee';

  const currentPeriod  = periods.find(p => String(p.id) === String(periodId));
  const unscoredCount  = items.filter(i => i.avg_pct == null).length;

  // Compute which frequency tiers are included for the selected period
  // freqTypes are ordered by hierarchy_order (via display_order from API)
  const currentPeriodType = currentPeriod?.period_type;
  const periodFreqEntry = freqTypes.find(f => f.key === currentPeriodType);
  const includedFreqs = periodFreqEntry
    ? freqTypes.filter(f => f.hierarchy_order <= periodFreqEntry.hierarchy_order)
    : [];

  return (
    <div className="p-5 overflow-y-auto flex-1">

      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-sm font-semibold text-gray-900">Reports</h1>
        <p className="text-xs text-gray-400 mt-0.5">Click any bar to drill deeper</p>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</span>
        </div>

        <div className="flex flex-wrap gap-4 items-end">

          {/* Period type tabs */}
          {freqTypes.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1.5 font-medium">Timeline</p>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => { setPeriodType(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    !periodType ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  All
                </button>
                {freqTypes.map(f => (
                  <button
                    key={f.key}
                    onClick={() => handlePeriodTypeChange(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      periodType === f.key
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Period dropdown */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 font-medium">Period</p>
            <select
              value={periodId}
              onChange={handlePeriodChange}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white min-w-48"
            >
              {filteredPeriods.length === 0 && <option value="">No periods</option>}
              {filteredPeriods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.period_type.charAt(0).toUpperCase() + p.period_type.slice(1)} · {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Department dropdown */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 font-medium">Department</p>
            <select
              value={stackDept?.id ?? ''}
              onChange={handleDeptFilterChange}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white min-w-44"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Role dropdown — only when a dept is selected */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5 font-medium">Role</p>
            <select
              value={stackRole?.id ?? ''}
              onChange={handleRoleFilterChange}
              disabled={!stackDept}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white min-w-44 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{stackDept ? 'All Roles' : 'Select dept first'}</option>
              {deptRoles.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Breadcrumb */}
      <div className="mb-4">
        <Breadcrumb stack={stack} onCrumbClick={handleCrumbClick} />
      </div>

      {/* Main drill-down card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* Card header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate flex items-center gap-2">
                {levelTitle}
                {last?.type === 'employee' && last.employee_code && (
                  <span className="text-sm font-mono font-normal text-gray-400">{last.employee_code}</span>
                )}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{levelSub}</span>
                {currentPeriod && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    {currentPeriod.label}
                  </span>
                )}
                {includedFreqs.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium capitalize">
                    Showing: {includedFreqs.map(f => f.label).join(' + ')} KPIs
                  </span>
                )}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportCsv}
                disabled={!items.length}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <Download size={13} />
                Export CSV
              </button>
              {canGoBack && (
                <button
                  onClick={() => handleCrumbClick(stack.length - 2)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              )}
            </div>
          </div>

          {/* View mode toggle — only at role level */}
          {isAtRole && (
            <div className="flex gap-1 mt-3 bg-gray-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => handleViewModeChange('kpi')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === 'kpi'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Target size={12} /> By KPI
              </button>
              <button
                onClick={() => handleViewModeChange('employee')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === 'employee'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Users size={12} /> By Employee
              </button>
            </div>
          )}
        </div>

        {/* Chart area */}
        <div className="px-4 py-2">
          {error ? (
            <div className="h-72 flex items-center justify-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : (
            <SlideIn slideKey={slideKey} dir={slideDir}>
              <DrillChart
                items={items}
                onBarClick={handleBarClick}
                isLeaf={isLeaf}
                loading={loading}
              />
            </SlideIn>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && items.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-400 bg-gray-50/60">
            <span className="font-medium text-gray-600">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
            {unscoredCount > 0
              ? <span className="text-gray-600 font-medium">{unscoredCount} without scores</span>
              : <span className="text-gray-500 font-medium">All scored ✓</span>
            }
            {!isLeaf && (
              <span className="ml-auto text-gray-300 flex items-center gap-1">
                Click a bar to drill down <ChevronRight size={12} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
