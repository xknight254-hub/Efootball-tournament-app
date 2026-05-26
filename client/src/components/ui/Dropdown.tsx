import React, { createContext, useState, useRef, useEffect, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue>({
  isOpen: false,
  setIsOpen: () => {},
  close: () => {},
});

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [close]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  // Focus first item when opened
  useEffect(() => {
    if (isOpen && firstItemRef.current) {
      firstItemRef.current.focus();
    }
  }, [isOpen]);

  // Arrow key navigation within dropdown
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    const menuItems = ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!menuItems || menuItems.length === 0) return;

    const items = Array.from(menuItems);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, close }}>
      <div className="relative" ref={ref}>
        <div
          onClick={() => setIsOpen(prev => !prev)}
          className="cursor-pointer"
          role="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          {trigger}
        </div>
        {isOpen && (
          <div
            className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} z-50 min-w-[200px] glass rounded-xl shadow-card-hover overflow-hidden animate-fade-in-down`}
            role="menu"
            aria-orientation="vertical"
            onKeyDown={handleKeyDown}
          >
            {React.Children.map(children, (child, idx) => {
              // Attach ref to first focusable child
              if (idx === 0 && React.isValidElement(child) && child.type === DropdownItem) {
                return React.cloneElement(child as React.ReactElement<{ menuItemRef?: React.Ref<HTMLButtonElement> }>, {
                  menuItemRef: firstItemRef,
                });
              }
              return child;
            })}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
};

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  menuItemRef?: React.Ref<HTMLButtonElement>;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({ children, onClick, icon, danger, menuItemRef }) => {
  const { close } = React.useContext(DropdownContext);

  return (
    <button
      ref={menuItemRef}
      role="menuitem"
      onClick={() => { onClick?.(); close(); }}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon && <span className="w-4 h-4 shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

export const DropdownDivider: React.FC = () => (
  <div className="h-px bg-dark-700 my-1" role="separator" />
);

export const DropdownLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-4 py-2 text-xs font-semibold text-dark-400 uppercase tracking-wider" role="presentation">
    {children}
  </div>
);
