export default function ReportCard({ report, onSelect }) {
  const { status_summary, total_templates } = report;
  const selfDone = Object.entries(status_summary)
    .filter(([s]) => ['self_submitted','both_submitted','disputed','reconciled'].includes(s))
    .reduce((sum, [, n]) => sum + n, 0);
  const disputes = status_summary['disputed'] || 0;
  const pct = total_templates > 0 ? Math.min(100, Math.round((selfDone / total_templates) * 100)) : 0;

  return (
    <button
      onClick={(e) => onSelect(report, e.currentTarget)}
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{report.name}</p>
          <p className="text-xs text-gray-400">{report.role_name} · {report.email}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{pct}%</p>
          <p className="text-xs text-gray-400">submitted</p>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
        <div className="bg-gray-900 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      {disputes > 0 && (
        <p className="text-xs text-red-600 font-medium">{disputes} disputed metric{disputes > 1 ? 's' : ''}</p>
      )}
    </button>
  );
}
