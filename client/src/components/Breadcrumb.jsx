import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumb({ items }) {
  // items: [{ label, to? }, ...]  — last item has no `to`
  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
          {item.to
            ? <Link to={item.to} className="hover:text-gray-600 transition-colors">{item.label}</Link>
            : <span className="text-gray-600 font-medium">{item.label}</span>
          }
        </span>
      ))}
    </nav>
  );
}
