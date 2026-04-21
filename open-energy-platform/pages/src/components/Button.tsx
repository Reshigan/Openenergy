import React from 'react';

// Button variants following IonEx v2 spec
type ButtonVariant = 'primary' | 'primary-accent' | 'secondary' | 'tertiary' | 'destructive' | 'success' | 'ghost';

// Button sizes
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ionex-brand text-white hover:bg-ionex-brand-light focus:ring-ionex-brand disabled:bg-ionex-border',
  'primary-accent': 'bg-ionex-accent text-ionex-brand hover:bg-ionex-accent-deep focus:ring-ionex-accent',
  secondary: 'bg-transparent text-ionex-brand border border-ionex-border hover:bg-ionex-surface-alt',
  tertiary: 'bg-transparent text-ionex-brand hover:bg-ionex-surface-alt',
  destructive: 'bg-ionex-error text-white hover:bg-ionex-error/90 focus:ring-ionex-error',
  success: 'bg-ionex-success text-white hover:bg-ionex-success/90 focus:ring-ionex-success',
  ghost: 'bg-transparent text-ionex-text-sub hover:bg-ionex-surface-alt hover:text-ionex-text',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-10 w-10 p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  
  return (
    <button
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-[6px] font-medium
        transition-colors duration-150 ease-ionex
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ionex-accent
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && icon}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
}

// Badge variants
type BadgeVariant = 'new' | 'beta' | 'preview' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  new: 'bg-ionex-accent text-ionex-brand',
  beta: 'bg-transparent text-ionex-accent border border-ionex-accent',
  preview: 'bg-transparent text-ionex-text-sub border border-ionex-border',
  success: 'bg-ionex-success-bg text-ionex-success',
  warning: 'bg-ionex-warning-bg text-ionex-warning',
  error: 'bg-ionex-error-bg text-ionex-error',
  info: 'bg-ionex-brand/10 text-ionex-brand',
  neutral: 'bg-gray-100 text-gray-800',
};

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium
      ${badgeVariantClasses[variant]}
      ${className}
    `}>
      {children}
    </span>
  );
}

// Input component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-[13px] font-medium text-ionex-text-sub mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ionex-text-mute">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full h-10 px-3 py-2
            bg-ionex-surface text-ionex-text
            border border-ionex-border rounded-[6px]
            text-[14px]
            placeholder:text-ionex-text-mute
            focus:outline-none focus:border-ionex-brand focus:ring-1 focus:ring-ionex-brand
            disabled:opacity-50 disabled:cursor-not-allowed
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${error ? 'border-ionex-error focus:border-ionex-error focus:ring-ionex-error' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ionex-text-mute">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-ionex-error">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1 text-[12px] text-ionex-text-mute">{hint}</p>
      )}
    </div>
  );
});

// Select component
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  className = '',
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-[13px] font-medium text-ionex-text-sub mb-1">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={`
          w-full h-10 px-3 py-2
          bg-ionex-surface text-ionex-text
          border border-ionex-border rounded-[6px]
          text-[14px]
          focus:outline-none focus:border-ionex-brand focus:ring-1 focus:ring-ionex-brand
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-ionex-error' : ''}
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-[12px] text-ionex-error">{error}</p>
      )}
    </div>
  );
});

export default Button;
