import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboard } from '../lib/api';
import {
  ClipboardCheck, AlertTriangle, IndianRupee, Users,
} from 'lucide-react';
import Tile from '../components/dashboard/Tile';
import TrendBars from '../components/dashboard/TrendBars';
import AttrBar from '../components/dashboard/AttrBar';
import Drawer from '../components/dashboard/Drawer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysLeft(endDate) {
  if (!endDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const end = endDate.slice(0, 10);
  if (end <= today) return end === today ? 0 : -1;
  // Count days between dates properly
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = new Date(end + 'T00:00:00') - new Date(today + 'T00:00:00');
  return Math.ceil(diff / msPerDay);
}

function deadlineBadge(endDate) {
  const d = daysLeft(endDate);
  if (d === null) return { label: '—', cls: 'text-gray-400' };
  if (d < 0)  return { label: 'Closed',     cls: 'text-gray-400' };
  if (d === 0) return { label: 'Due today',  cls: 'text-red-600' };
  if (d <= 3)  return { label: `${d}d left`, cls: 'text-red-600' };
  if (d <= 7)  return { label: `${d}d left`, cls: 'text-gray-600' };
  return { label: `${d}d left`, cls: 'text-gray-500' };
}

function reportStatus(r) {
  if (r.reconciled > 0) return { label: 'Reconciled', cls: 'bg-gray-900 text-white' };
  if (r.disputed > 0)   return { label: 'Disputed',   cls: 'border border-gray-800 text-gray-900 bg-white' };
  if (r.mgr_done > 0)   return { label: 'Reviewed',   cls: 'bg-gray-200 text-gray-700' };
  if (r.self_done > 0)  return { label: 'Self done',  cls: 'bg-gray-100 text-gray-600' };
  return                       { label: 'Pending',    cls: 'bg-gray-50 text-gray-400' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { employee } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null); // 'team' | 'org' | 'periods'

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex-1 p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 h-40 animate-pulse" style={{ flex: '0 0 240px' }} />
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 h-40 animate-pulse" />
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
      Failed to load dashboard.
    </div>
  );

  const { my_stats, score_trend, team_stats, subtree_stats, dispute_count, distribution_pending } = data;
  const mainStat = my_stats?.[0];
  const firstName = employee?.name?.split(' ')[0] || '';

  // Deadline
  const dl = mainStat ? deadlineBadge(mainStat.end_date) : null;

  // Team tile: direct reports submitted count
  const teamPeriod = team_stats?.periods?.[0];
  const hasTeam = teamPeriod && team_stats.direct_reports > 0;
  const hasOrg  = subtree_stats?.total_employees > 0;

  // Alert messages (inline pills, not blocks)
  const alerts = [
    dispute_count > 0 && { icon: AlertTriangle, msg: `${dispute_count} dispute${dispute_count !== 1 ? 's' : ''}`, to: '/review', cls: 'text-red-600 bg-red-50 border-red-200' },
    distribution_pending > 0 && { icon: IndianRupee, msg: `${distribution_pending} distribution${distribution_pending !== 1 ? 's' : ''} pending`, to: '/distribution', cls: 'text-gray-700 bg-gray-100 border-gray-300' },
    (mainStat && daysLeft(mainStat.end_date) !== null && daysLeft(mainStat.end_date) <= 2 && mainStat.self_done < mainStat.total_templates) && {
      icon: ClipboardCheck,
      msg: `Scoring closes ${daysLeft(mainStat.end_date) === 0 ? 'today' : `in ${daysLeft(mainStat.end_date)}d`}`,
      to: '/scoring',
      cls: 'text-gray-700 bg-gray-100 border-gray-300',
    },
  ].filter(Boolean);

  // 4th tile: team (managers), org (admin only), or disputes
  const fourthTile = (() => {
    if (hasTeam) return {
      label: 'Team',
      value: `${teamPeriod.self_submitted_count}/${teamPeriod.total_reports}`,
      sub: 'self-scored',
      subCls: teamPeriod.dispute_count > 0 ? 'text-red-500' : 'text-gray-400',
      action: 'Details',
      onClick: () => setDrawer('team'),
    };
    if (hasOrg && employee?.is_admin) return {
      label: 'Org',
      value: `${subtree_stats.periods[0]?.self_submitted_count ?? 0}/${subtree_stats.total_employees}`,
      sub: 'submitted',
      action: 'Details',
      onClick: () => setDrawer('org'),
    };
    if (dispute_count > 0) return {
      label: 'Disputes',
      value: dispute_count,
      sub: 'need resolution',
      subCls: 'text-red-500',
    };
    return {
      label: 'Status',
      value: '✓',
      sub: 'all clear',
      subCls: 'text-gray-500',
    };
  })();

  return (
    <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            {greeting()}, {firstName}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {employee?.role_name || 'Admin'}
            {employee?.department_name ? ` · ${employee.department_name}` : ''}
            {data.active_period_count > 1 && (
              <button
                onClick={() => setDrawer('periods')}
                className="ml-2 text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                {data.active_period_count} active periods
              </button>
            )}
          </p>
        </div>
        <Link
          to="/scoring"
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
        >
          <ClipboardCheck size={13} /> Score KPIs
        </Link>
      </div>

      {/* Alert strip (only if needed) */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {alerts.map((a, i) => (
            <Link
              key={i}
              to={a.to}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${a.cls}`}
            >
              <a.icon size={12} />
              {a.msg} →
            </Link>
          ))}
        </div>
      )}

      {/* 4 stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {/* My Score */}
        <Tile
          label="My Score"
          value={mainStat?.my_score !== null && mainStat?.my_score !== undefined ? `${mainStat.my_score}%` : '—'}
          sub={mainStat?.my_score !== null && mainStat?.my_score !== undefined ? 'weighted avg' : 'no reconciled scores'}
        />
        {/* KPIs Done */}
        <Link to="/scoring" className="block">
          <Tile
            label="KPIs Done"
            value={mainStat ? `${mainStat.self_done}/${mainStat.total_templates}` : '—'}
            sub={mainStat?.period_label}
            action="Score"
          />
        </Link>
        {/* Deadline */}
        <Tile
          label="Deadline"
          value={dl?.label ?? '—'}
          subCls={dl?.cls}
          sub={mainStat?.end_date ? new Date(mainStat.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
        />
        {/* Team / Org / Disputes */}
        <Tile {...fourthTile} />
      </div>

      {/* Bottom row: Trend + Attributes — or Welcome Card for new employees */}
      {!mainStat && (!score_trend || score_trend.length === 0) ? (
        <div className="bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl p-6 text-white">
          <h2 className="text-base font-bold mb-1">Welcome to KPI Tracker 👋</h2>
          <p className="text-sm text-gray-300 mb-4">
            Here's how to get started:
          </p>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Go to KPI Scoring and rate yourself on your assigned KPIs for the current period.' },
              { step: '2', text: "Your manager will review and score you. You'll be notified if there's a dispute." },
              { step: '3', text: 'Once reconciled, your final scores appear here on the dashboard.' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-white/20 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                <p className="text-sm text-gray-200">{text}</p>
              </div>
            ))}
          </div>
          <Link
            to="/scoring"
            className="inline-flex items-center gap-2 mt-5 bg-white text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ClipboardCheck size={14} /> Start Scoring
          </Link>
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Score Trend */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col min-w-0" style={{ flex: '0 0 240px' }}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Score Trend</p>
            <p className="text-xs text-gray-400 mb-3">Last 5 closed periods</p>
            <div className="flex-1 flex items-end">
              <TrendBars trend={score_trend} />
            </div>
          </div>

          {/* Attribute breakdown */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 flex flex-col min-w-0 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Attribute Breakdown</p>
              {mainStat?.period_label && (
                <span className="text-xs text-gray-400">{mainStat.period_label}</span>
              )}
            </div>
            {mainStat?.attribute_breakdown?.length > 0 ? (
              <div className="flex-1 flex flex-col justify-around gap-2 overflow-hidden">
                {mainStat.attribute_breakdown.map(attr => (
                  <AttrBar key={attr.attribute_name} attr={attr} />
                ))}
                <div className="flex items-center gap-3 pt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="w-2 h-1.5 rounded-sm bg-gray-900 inline-block" /> Reconciled
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="w-2 h-1.5 rounded-sm bg-gray-300 inline-block" /> Scored
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mt-2">No KPIs assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Drawers ── */}

      {drawer === 'team' && team_stats && (
        <Drawer title={`Team · ${team_stats.direct_reports} direct report${team_stats.direct_reports !== 1 ? 's' : ''}`} onClose={() => setDrawer(null)}>
          {team_stats.periods.map(p => (
            <div key={p.period_id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{p.period_label}</p>
              {p.reports.map(r => {
                const { label, cls } = reportStatus(r);
                return (
                  <div key={r.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.role_name}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cls}`}>{label}</span>
                  </div>
                );
              })}
              {p.dispute_count > 0 && (
                <Link to="/review" className="flex items-center gap-1.5 mt-3 text-xs text-red-600 font-medium hover:underline">
                  <AlertTriangle size={11} /> {p.dispute_count} dispute{p.dispute_count !== 1 ? 's' : ''} — go to Review
                </Link>
              )}
            </div>
          ))}
        </Drawer>
      )}

      {drawer === 'org' && subtree_stats && (
        <Drawer title={`Org Overview · ${subtree_stats.total_employees} employees`} onClose={() => setDrawer(null)}>
          {subtree_stats.periods.map(p => (
            <div key={p.period_id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{p.period_label}</p>
              <div className="space-y-1.5 mb-3">
                {[
                  { label: 'Self-submitted', val: p.self_submitted_count, color: 'bg-gray-500' },
                  { label: 'Reconciled',     val: p.reconciled_count,     color: 'bg-gray-900' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>{label}</span>
                      <span>{val}/{p.total_employees}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${p.total_employees > 0 ? (val / p.total_employees) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {p.by_role && Object.entries(p.by_role).map(([role, stats]) => (
                <div key={role} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-medium text-gray-700 truncate pr-2">{role}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {stats.reconciled}/{stats.total}
                    {stats.disputed > 0 && <span className="text-red-500 ml-1">· {stats.disputed}⚠</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </Drawer>
      )}

      {drawer === 'periods' && (
        <Drawer title="All Active Periods" onClose={() => setDrawer(null)}>
          {my_stats.map(stat => (
            <div key={stat.period_id} className="py-3 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-800">{stat.period_label}</span>
                {stat.my_score !== null && (
                  <span className="text-sm font-bold text-gray-900">{stat.my_score}%</span>
                )}
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>Self-scored</span>
                  <span>{stat.self_done}/{stat.total_templates}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reconciled</span>
                  <span>{stat.fully_reconciled}/{stat.total_templates}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deadline</span>
                  <span className={deadlineBadge(stat.end_date).cls}>{deadlineBadge(stat.end_date).label}</span>
                </div>
              </div>
            </div>
          ))}
        </Drawer>
      )}

    </div>
  );
}
