import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Lock, BarChart2 } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import { getScoreHistory } from '../../lib/api';

function ScoreHistorySection({ scoreId }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (history.length > 0) { setOpen(true); return; }
    setLoading(true);
    try {
      const h = await getScoreHistory(scoreId);
      setHistory(h);
      setOpen(true);
    } catch {}
    finally { setLoading(false); }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={load}
        className="mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        {loading ? 'Loading…' : '▸ View score history'}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Score History</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">▾ Hide</button>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-gray-400">No history yet.</p>
      ) : (
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.id} className="text-xs text-gray-600 flex items-center gap-2">
              <span className="text-gray-400">{new Date(h.changed_at).toLocaleDateString()}</span>
              <span className="font-medium capitalize">{h.change_type.replace('_', ' ')}</span>
              <span>by {h.changed_by_name}</span>
              {h.old_value !== null && <span className="text-gray-400">{h.old_value} →</span>}
              {h.new_value !== null && <span className="font-semibold text-gray-800">{h.new_value}</span>}
              {h.notes && <span className="text-gray-400 italic">"{h.notes}"</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreButton({ value, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[2.5rem] min-h-[2.5rem] sm:w-10 sm:h-10 rounded-lg text-sm font-semibold border transition-all touch-manipulation ${
        selected
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600 hover:text-gray-900'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {value}
    </button>
  );
}

function GuideSection({ template }) {
  const [open, setOpen] = useState(false);
  if (!template.scoring_guide) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium">
        {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} Guide
      </button>
      {open && (
        <pre className="mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 whitespace-pre-wrap font-sans">
          {template.scoring_guide}
        </pre>
      )}
    </div>
  );
}

export default function ReviewRow({ item, localScore, localNotes, onScoreChange, onNotesChange, submitting, readOnly }) {
  const { template, score } = item;
  const status = score?.status || 'pending';
  const isExternallyScored = !!template.is_externally_scored;
  const isRaw = template.score_type === 'raw_100';
  const isAgg = score?.is_aggregated === true;
  const isReconciled = status === 'reconciled';

  const options =
    template.score_type === 'scale_2_5'  ? [2,3,4,5] :
    template.score_type === 'scale_1_5'  ? [1,2,3,4,5] :
    template.score_type === 'scale_1_10' ? [1,2,3,4,5,6,7,8,9,10] : [];

  const selfScore    = score?.self_score;
  const managerScore = localScore !== undefined ? localScore : score?.manager_score;
  const hasDiff = !isExternallyScored &&
                  selfScore !== null && selfScore !== undefined &&
                  managerScore !== null && managerScore !== undefined &&
                  Math.abs(selfScore - managerScore) >= 1;

  // Aggregated KPI (e.g. quarterly KPI shown in a yearly period) — read-only
  if (isAgg) {
    const aggScore = score?.final_score ?? score?.self_score;
    return (
      <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{template.sub_metric_name}</p>
            <p className="text-xs text-gray-400">{template.attribute_name} · {template.weight_percentage}% weight · <span className="capitalize">{template.frequency}</span> KPI</p>
          </div>
          <StatusBadge status="aggregated" />
        </div>
        <div className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <BarChart2 size={13} className="mt-0.5 shrink-0" />
          <span>
            Auto-calculated from {score?.child_count ?? 0} {template.frequency} period{score?.child_count !== 1 ? 's' : ''}.
            {aggScore !== null && aggScore !== undefined ? ` Avg score: ${typeof aggScore === 'number' ? aggScore.toFixed(2) : aggScore}` : ' No data yet.'}
            {' '}Only editable in its base {template.frequency} period.
          </span>
        </div>
      </div>
    );
  }

  // Externally-scored KPI — show read-only with lock
  if (isExternallyScored) {
    return (
      <div className="p-4 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm">{template.sub_metric_name}</p>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                <Lock size={10} /> External Score
              </span>
            </div>
            <p className="text-xs text-gray-400">{template.attribute_name} · {template.weight_percentage}% weight</p>
            <GuideSection template={template} />
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Employee Self-Score</p>
            {selfScore !== null && selfScore !== undefined ? (
              <span className="text-lg font-bold text-gray-700">{selfScore}</span>
            ) : (
              <span className="text-sm text-gray-300">Not submitted yet</span>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">External Final Score</p>
            {isReconciled && score?.final_score !== null && score?.final_score !== undefined ? (
              <span className="text-lg font-bold text-gray-900">{score.final_score}</span>
            ) : (
              <span className="text-sm text-gray-400 italic">Awaiting external scorer</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border ${
      isReconciled          ? 'border-gray-200 bg-gray-50/50' :
      status === 'disputed' ? 'border-red-200 bg-red-50/20' :
      hasDiff               ? 'border-gray-200 bg-gray-50/30' :
      'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{template.sub_metric_name}</p>
          <p className="text-xs text-gray-400">{template.attribute_name} · {template.weight_percentage}% weight</p>
          <GuideSection template={template} />
        </div>
        <StatusBadge status={status} />
      </div>

      {isRaw ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Info size={13} />
          <span>Score set by ₹100 distribution: <strong className="text-gray-700">{score?.final_score ?? '—'}</strong></span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Employee Self-Score</p>
            {selfScore !== null && selfScore !== undefined ? (
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${hasDiff ? 'text-gray-600' : 'text-gray-700'}`}>
                    {selfScore}
                  </span>
                  {score?.self_notes && (
                    <span className="text-xs text-gray-400 italic">"{score.self_notes}"</span>
                  )}
                </div>
                {hasDiff && managerScore !== null && managerScore !== undefined && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-600 font-semibold">
                      {selfScore} → {managerScore}
                    </span>
                    <span className="text-xs text-gray-500">
                      Δ {Math.abs(selfScore - managerScore)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-300">Not submitted yet</span>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">{readOnly ? 'Manager Score' : 'Your Score'}</p>
            {isReconciled ? (
              <div>
                <span className="text-lg font-bold text-gray-900">{score?.final_score}</span>
                <span className="text-xs text-gray-400 ml-2">(final)</span>
              </div>
            ) : readOnly ? (
              <div>
                {managerScore !== null && managerScore !== undefined
                  ? <span className="text-lg font-bold text-gray-700">{managerScore}</span>
                  : <span className="text-sm text-gray-300">Not scored yet</span>}
              </div>
            ) : options.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {options.map(opt => (
                  <ScoreButton
                    key={opt}
                    value={opt}
                    selected={managerScore === opt}
                    onClick={() => onScoreChange(template.id, opt)}
                    disabled={submitting}
                  />
                ))}
              </div>
            ) : (
              <input
                type="number"
                value={managerScore ?? ''}
                onChange={e => onScoreChange(template.id, e.target.value === '' ? null : parseFloat(e.target.value))}
                disabled={submitting}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            )}

          </div>
        </div>
      )}

      {hasDiff && !isReconciled && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <span>⚠</span>
          <span>Self score <strong>{selfScore}</strong> vs your score <strong>{managerScore}</strong> — difference of <strong>{Math.abs(selfScore - managerScore)}</strong> will trigger a dispute.</span>
        </div>
      )}

      {!isRaw && !isReconciled && !readOnly && (
        <div className="mt-3">
          <textarea
            value={localNotes !== undefined ? localNotes : (score?.manager_notes || '')}
            onChange={e => onNotesChange(template.id, e.target.value)}
            disabled={submitting}
            placeholder="Add manager notes…"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none disabled:opacity-50"
          />
        </div>
      )}

      {score?.id && (
        <ScoreHistorySection scoreId={score.id} />
      )}
    </div>
  );
}
