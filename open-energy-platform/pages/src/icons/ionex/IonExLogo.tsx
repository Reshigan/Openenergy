import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  primary?: string;
  accent?: string;
}

export const IonExLogo: React.FC<IconProps> = ({ 
  size = 32, 
  className = '',
  primary = 'var(--ionex-brand)',
  accent = 'var(--ionex-accent)'
}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <rect width="32" height="32" rx="6" fill={primary} />
    <path 
      d="M8 8L24 24M24 8L8 24" 
      stroke="white" 
      strokeWidth="3" 
      strokeLinecap="round"
      style={{ transform: 'rotate(22.5deg 16 16)', transformOrigin: 'center' }}
    />
    <path 
      d="M10 10L22 22M22 10L10 22" 
      stroke={accent} 
      strokeWidth="1.5" 
      strokeLinecap="round"
      style={{ transform: 'rotate(22.5deg 16 16)', transformOrigin: 'center' }}
    />
  </svg>
);

export default IonExLogo;
