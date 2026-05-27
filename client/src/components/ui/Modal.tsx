import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm w-full',
  md: 'max-w-lg w-full',
  lg: 'max-w-2xl w-full',
  xl: 'max-w-4xl w-full',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 animate-fade-in" />
      {/* Modal panel */}
      <div
        className={`relative w-full ${sizeClasses[size]} max-h-[100vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl animate-scale-in`}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--color-bg-panel, #1a1a2e)', border: '1px solid var(--color-border)' }}
      >
        {title && (
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-dark-700 sticky top-0 z-10" style={{ background: 'var(--color-bg-panel, #1a1a2e)' }}>
            <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-white">{title}</h2>
            <button onClick={onClose} className="btn-ghost btn-icon flex-shrink-0 ml-3" aria-label="Close modal">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
};
