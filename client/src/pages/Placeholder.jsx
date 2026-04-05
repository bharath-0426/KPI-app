import React from 'react';
import { Construction } from 'lucide-react';

export default function Placeholder({ title }) {
  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Construction size={24} className="text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Construction size={48} className="text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">This section is coming in a future step.</p>
      </div>
    </div>
  );
}
