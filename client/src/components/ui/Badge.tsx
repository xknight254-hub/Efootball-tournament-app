import React from 'react';

interface BadgeProps {
  variant?: 'open' | 'live' | 'completed' | 'disputed' | 'checkin';
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const variantClass: Record<string, string> = {
  open: 'badge-open',
  live: 'badge-live',
  completed: 'badge-completed',
  disputed: 'badge-disputed',
  checkin: 'badge-checkin',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'open',
  pulse = false,
  children,
  className = '',
  style,
}) => {
  return (
    <span className={`badge ${variantClass[variant]} ${className}`} style={style}>
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
};
