import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="text-gray-600 text-sm">eFootball Arena</span>
          </div>
          <div className="flex items-center space-x-6 text-sm text-gray-500">
            <Link to="/about" className="hover:text-indigo-600 transition-colors">About</Link>
            <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
          </div>
          <p className="text-sm text-gray-400">© 2024 eFootball Arena. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};