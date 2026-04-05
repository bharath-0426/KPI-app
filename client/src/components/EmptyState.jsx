export default function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      {Icon && <Icon size={28} className="text-gray-200 mx-auto mb-3" />}
      <p className="text-gray-500 font-medium text-sm">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
