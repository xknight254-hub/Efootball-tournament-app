import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], message: string, duration = 4000) => {
    const id = `toast-${++toastId}`;
    const toast: Toast = { id, type, message, duration };
    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((msg: string, duration?: number) => addToast('success', msg, duration), [addToast]);
  const error = useCallback((msg: string, duration?: number) => addToast('error', msg, duration), [addToast]);
  const info = useCallback((msg: string, duration?: number) => addToast('info', msg, duration), [addToast]);
  const warning = useCallback((msg: string, duration?: number) => addToast('warning', msg, duration), [addToast]);

  return { toasts, addToast, removeToast, success, error, info, warning };
}
