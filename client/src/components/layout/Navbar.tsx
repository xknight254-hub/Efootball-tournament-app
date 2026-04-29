import React from 'react';
import { Link } from 'react-router-dom';

export const Navbar: React.FC = () => {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <span className="text-xl font-bold text-gray-900">eFootball Arena</span>
          </Link>
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/tournaments" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Tournaments
            </Link>
            <Link to="/teams" className="text-gray-600 hover:text-indigo-600 transition-colors">
              Teams
            </Link>
            <Link to="/about" className="text-gray-600 hover:text-indigo-600 transition-colors">
              About
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/login">
              <button className="text-gray-600 hover:text-indigo-600 font-medium">
                Sign In
              </button>
            </Link>
            <Link to="/register">
              <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};