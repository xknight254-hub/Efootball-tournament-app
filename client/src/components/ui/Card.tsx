import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: 'none' | 'green' | 'blue' | 'purple';
  onClick?: () => void;
}

const glowClasses: Record<string, string> = {
  none: '',
  green: 'hover:shadow-neon-green',
  blue: 'hover:shadow-neon-blue',
  purple: 'hover:shadow-neon-purple',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  glow = 'none',
  onClick,
}) => {
  return (
    <div
      className={`glass rounded-2xl p-6 ${hover ? `glass-hover cursor-pointer ${glowClasses[glow]}` : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};
