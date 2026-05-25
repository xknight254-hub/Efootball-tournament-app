import React, { createContext, useState, useRef, useEffect } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

const DropdownContext = createContext<{ isOpen: boolean; setIsOpen: (v: boolean) => void }>({
  isOpen: false,
  setIsOpen: () => {},
});

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="relative" ref={ref}>
        <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
          {trigger}
        </div>
        {isOpen && (
          <div className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} z-50 min-w-[200px] glass rounded-xl shadow-card-hover overflow-hidden animate-fade-in-down`}>
            {children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownItem: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}> = ({ children, onClick, icon, danger }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon && <span className="w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
};

export const DropdownDivider: React.FC = () => (
  <div className="h-px bg-dark-700 my-1" />
);

export const DropdownLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-2 text-xs font-semibold text-dark-400 uppercase tracking-wider">
    {children}
  </div>
);
