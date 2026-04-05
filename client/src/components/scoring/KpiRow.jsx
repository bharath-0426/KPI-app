import { useRef } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Loader2, BarChart2 } from 'lucide-react';
import { STATUS_CFG } from '../../lib/constants';
import ScoreCell from './ScoreCell';

export default function KpiRow({
  item, localScore, localNotes,
  onScoreChange, onNotesChange, onSave,
  rowState, periodType, expanded, onToggleExpand,
  windowOpen = true,
}) {
  const { template, score } = item;
  const inputRef = useRef();

  const isAgg      = score?.is_aggregated === true;
  const isRaw100   = template.score_type === 'raw_100';
  const isReadOnly = isRaw100 || isAgg || !windowOpen;
  const status     = score?.status || 'pending';
  const isLocked   = status === 'reconciled' && !isAgg;
  const freqMismatch = template.frequency !== periodType;

  const displayScore = isAgg
    ? (score.final_score ?? score.self_score)
    : status === 'reconciled'
      ? score?.final_score
      : ['self_submitted', 'both_submitted', 'disputed'].includes(status)
        ? score?.self_score
        : null;

  const currentValue = (isReadOnly || isLocked)
    ? displayScore
    : (localScore !== undefined ? localScore : displayScore);

  const isDirty  = !isReadOnly && !isLocked && localScore !== undefined;
  const isSaving = rowState === 'saving';
  const isSaved  = rowState === 'saved';
  const isError  = rowState === 'error';

  const hasGuide = !!(
    template.scoring_guide || template.formula ||
    template.calculation_guide || template.measurement_description
  );
  const hasExpand = !isReadOnly || hasGuide || isAgg;

  const rowBg = isSaved  ? 'bg-gray-50'
    : isDirty  ? 'bg-gray-50/60'
    : isAgg    ? ''
    : '';

  const statusCfg = STATUS_CFG[isAgg ? 'aggregated' : status] || STATUS_CFG.pending;

  return (
    <>
      <tr className={`border-b border-gray-100 transition-colors duration-300 ${rowBg}`}>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
              isDirty ? 'bg-gray-400' : isSaved ? 'bg-gray-600' : 'bg-transparent'
            }`} />
            <span className="text-sm text-gray-800 font-medium truncate">
              {template.sub_metric_name}
            </span>
            {freqMismatch && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0">
                {template.frequency}
              </span>
            )}
          </div>
        </td>

        <td className="py-2.5 px-3 text-sm text-gray-400 text-right whitespace-nowrap w-16">
          {template.weight_percentage}%
        </td>

        <td className="py-2.5 px-3 w-44">
          {isAgg ? (
            <span className="text-sm font-semibold text-gray-600">
              {displayScore !== null && displayScore !== undefined ? displayScore.toFixed(2) : '—'}
            </span>
          ) : isLocked ? (
            <span className="text-sm font-semibold text-gray-700">{displayScore ?? '—'}</span>
          ) : (
            <ScoreCell
              template={template}
              value={currentValue}
              onChange={v => onScoreChange(template.id, v)}
              onBlur={() => onSave(template.id)}
              disabled={isSaving}
              inputRef={inputRef}
            />
          )}
        </td>

        <td className="py-2.5 px-3 whitespace-nowrap w-32">
          {isSaving ? (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </span>
          ) : isSaved ? (
            <span className="flex items-center gap-1 text-xs text-gray-600 font-medium">
              <CheckCircle2 size={12} /> Saved
            </span>
          ) : isError ? (
            <span className="text-xs text-red-500 font-medium">Save failed</span>
          ) : (
            <span className={`text-xs font-medium ${statusCfg.cls}`}>{statusCfg.label}</span>
          )}
        </td>

        <td className="py-2.5 px-3 w-10 text-right">
          {hasExpand && (
            <button
              onClick={() => onToggleExpand(template.id)}
              className={`p-1 rounded-md transition-colors ${
                expanded ? 'text-gray-600 bg-gray-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
              }`}
              title={expanded ? 'Collapse' : 'Notes & guide'}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className={`border-b border-gray-100 ${rowBg}`}>
          <td colSpan={5} className="px-6 py-4 bg-gray-50/70">
            <div className="flex gap-8 flex-wrap">
              {!isReadOnly && (
                <div className="flex-1 min-w-52">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Notes / Justification
                  </p>
                  <textarea
                    value={localNotes !== undefined ? localNotes : (score?.self_notes || '')}
                    onChange={e => onNotesChange(template.id, e.target.value)}
                    onBlur={() => onSave(template.id)}
                    disabled={isSaving || isLocked}
                    placeholder="Add context or justification…"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none disabled:opacity-50 bg-white"
                  />
                </div>
              )}

              {hasGuide && (
                <div className={`flex-1 min-w-52 ${!isReadOnly ? 'border-l border-gray-200 pl-8' : ''}`}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Scoring Guide
                  </p>
                  <div className="space-y-1.5 text-xs text-gray-600">
                    {template.measurement_description && (
                      <p><span className="font-medium">Measurement:</span> {template.measurement_description}</p>
                    )}
                    {template.scoring_guide && (
                      <pre className="whitespace-pre-wrap font-sans">{template.scoring_guide}</pre>
                    )}
                    {template.formula && template.formula !== '-' && (
                      <p><span className="font-medium">Formula:</span> {template.formula}</p>
                    )}
                    {template.calculation_guide && (
                      <pre className="whitespace-pre-wrap font-sans">{template.calculation_guide}</pre>
                    )}
                  </div>
                </div>
              )}

              {isAgg && score?.child_scores?.length > 0 && (
                <div className="flex-1 min-w-64">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Sub-period breakdown ({score.child_count} periods)
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-200">
                        <th className="text-left py-1 font-medium">Period</th>
                        <th className="text-right py-1 font-medium">Self</th>
                        <th className="text-right py-1 font-medium">Manager</th>
                        <th className="text-right py-1 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {score.child_scores.map((cs, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 text-gray-600">{cs.period_label}</td>
                          <td className="py-1 text-right text-gray-700">{cs.self_score ?? '—'}</td>
                          <td className="py-1 text-right text-gray-700">{cs.manager_score ?? '—'}</td>
                          <td className="py-1 text-right text-gray-400 capitalize">{cs.status}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200 font-semibold text-gray-700">
                        <td className="py-1">Avg</td>
                        <td className="py-1 text-right">{score.self_score !== null ? score.self_score.toFixed(2) : '—'}</td>
                        <td className="py-1 text-right">{score.manager_score !== null ? score.manager_score.toFixed(2) : '—'}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
