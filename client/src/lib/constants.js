// Frequency types used across period pickers
export const FREQ_TYPES = [
  { key: 'weekly',     label: 'Weekly' },
  { key: 'monthly',    label: 'Monthly' },
  { key: 'quarterly',  label: 'Quarterly' },
  { key: 'yearly',     label: 'Yearly' },
];

// KPI score status config — cls for inline text, badge for pill badges
export const STATUS_CFG = {
  pending:           { label: 'Pending',          cls: 'text-gray-400',   badge: 'bg-gray-100 text-gray-400' },
  self_submitted:    { label: 'Self Submitted',   cls: 'text-gray-600',   badge: 'bg-gray-100 text-gray-600' },
  manager_submitted: { label: 'Manager Scored',   cls: 'text-gray-700',   badge: 'bg-gray-200 text-gray-700' },
  both_submitted:    { label: 'Both Submitted',   cls: 'text-gray-700',   badge: 'bg-gray-200 text-gray-800' },
  disputed:          { label: 'Disputed',         cls: 'text-gray-900 font-medium', badge: 'border border-gray-800 text-gray-900 bg-white' },
  reconciled:        { label: 'Reconciled',       cls: 'text-gray-900',   badge: 'bg-gray-900 text-white' },
  aggregated:        { label: 'Auto-calculated',  cls: 'text-gray-500',   badge: 'bg-gray-100 text-gray-500 border border-gray-200' },
};

// Roles that appear in Manager Review nav item
export const MANAGER_ROLES = ['GH', 'PM', 'EM', 'PL'];
