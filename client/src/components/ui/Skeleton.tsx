import React, { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'title' | 'avatar' | 'card' | 'button';
  lines?: number;
  style?: CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  lines = 1,
  style,
}) => {
  if (variant === 'text') {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={`skeleton-text ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${className}`} />
        ))}
      </div>
    );
  }

  const variantClass: Record<string, string> = {
    title: 'skeleton-title',
    avatar: 'skeleton-avatar',
    card: 'skeleton-card',
    button: 'skeleton h-10 w-24',
  };

  return <div className={`${variantClass[variant]} ${className}`} style={style} />;
};

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  color?: 'primary' | 'neon';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  className = '',
  showLabel = false,
  color = 'primary',
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      <div className="progress-bar">
        <div
          className={`progress-fill ${color === 'neon' ? 'bg-gradient-to-r from-neon-green to-neon-blue' : ''}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-dark-400 mt-1 text-right">{value}/{max}</p>
      )}
    </div>
  );
};
