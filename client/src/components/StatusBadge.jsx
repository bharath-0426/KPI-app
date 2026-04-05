import { STATUS_CFG } from '../lib/constants';

export default function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}
