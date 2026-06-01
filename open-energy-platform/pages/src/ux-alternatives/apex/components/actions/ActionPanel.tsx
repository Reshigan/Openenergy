import React, { useState } from 'react';
import { OeIcon, IconName } from '../icons/Icons';

export interface Action {
  id: string;
  label: string;
  description?: string;
  icon?: IconName;
  variant?: 'primary' | 'danger' | 'secondary' | 'ghost';
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
  /** Opens an inline form if provided */
  form?: React.ReactNode;
}

interface ActionPanelProps {
  actions: Action[];
  title?: string;
  compact?: boolean;
}

export function ActionPanel({ actions, title = 'Available Actions', compact = false }: ActionPanelProps) {
  const [activeFormId, setActiveFormId] = useState<string | null>(null);

  const activeAction = actions.find(a => a.id === activeFormId);

  const handleClick = (action: Action) => {
    if (action.disabled) return;
    if (action.form) {
      setActiveFormId(prev => prev === action.id ? null : action.id);
    } else {
      action.onClick?.();
    }
  };

  return (
    <div
      style={{
        background: 'var(--oe-canvas)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        overflow: 'hidden',
        boxShadow: 'var(--oe-shadow-card)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: compact ? '10px 14px' : '12px 14px',
          borderBottom: '1px solid var(--oe-border-2)',
          background: 'var(--oe-surf)',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--oe-text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </div>

      {/* Action buttons */}
      <div style={{ padding: compact ? '8px' : '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {actions.map(action => (
          <div key={action.id}>
            <ActionButton
              action={action}
              active={activeFormId === action.id}
              compact={compact}
              onClick={() => handleClick(action)}
            />
          </div>
        ))}
      </div>

      {/* Inline form */}
      {activeAction?.form && (
        <div
          style={{
            borderTop: '1px solid var(--oe-border)',
            padding: '16px',
            background: 'var(--oe-surf)',
            animation: 'oe-fadeIn 120ms var(--oe-ease)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--oe-text-1)' }}>
              {activeAction.label}
            </div>
            <button
              onClick={() => setActiveFormId(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--oe-text-3)', padding: '4px' }}
            >
              <OeIcon name="close" size={14} />
            </button>
          </div>
          {activeAction.form}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  active,
  compact,
  onClick,
}: {
  action: Action;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const variantStyles = getVariantStyles(action.variant ?? 'secondary', active, hovered, action.disabled);

  return (
    <button
      onClick={onClick}
      disabled={action.disabled}
      title={action.disabled ? action.disabledReason : undefined}
      style={{
        width: '100%',
        border: variantStyles.border,
        background: variantStyles.bg,
        borderRadius: 'var(--oe-r-btn)',
        padding: compact ? '7px 10px' : '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: action.disabled ? 'not-allowed' : 'pointer',
        opacity: action.disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background 80ms var(--oe-ease), border-color 80ms, transform 100ms var(--oe-ease)',
        transform: 'scale(1)',
        boxShadow: action.variant === 'primary' ? 'var(--oe-shadow-btn)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => { if (!action.disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
      onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
    >
      {action.icon && (
        <OeIcon name={action.icon} size={14} color={variantStyles.iconColor} />
      )}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: variantStyles.text,
            lineHeight: 1.2,
          }}
        >
          {action.label}
        </div>
        {action.description && !compact && (
          <div style={{ fontSize: '11px', color: variantStyles.subtext, marginTop: '1px', lineHeight: 1.3 }}>
            {action.description}
          </div>
        )}
      </div>
      {action.form && (
        <OeIcon
          name={active ? 'chevron-down' : 'chevron-right'}
          size={12}
          color={variantStyles.text}
        />
      )}
    </button>
  );
}

function getVariantStyles(
  variant: Action['variant'],
  active: boolean,
  hovered: boolean,
  disabled?: boolean,
) {
  if (disabled) {
    return {
      bg: 'var(--oe-surf)',
      border: '1px solid var(--oe-border)',
      text: 'var(--oe-text-3)',
      subtext: 'var(--oe-text-4)',
      iconColor: 'var(--oe-text-4)',
    };
  }

  if (variant === 'primary' || active) {
    return {
      bg: active ? 'var(--oe-grad-active)' : hovered ? 'var(--oe-grad-active-hover)' : 'var(--oe-grad-button)',
      border: 'none',
      text: '#ffffff',
      subtext: 'rgba(255,255,255,0.7)',
      iconColor: '#ffffff',
    };
  }

  if (variant === 'danger') {
    return {
      bg: hovered ? 'var(--oe-rose-bg)' : 'var(--oe-canvas)',
      border: `1px solid ${hovered ? 'var(--oe-rose)' : 'var(--oe-border)'}`,
      text: 'var(--oe-rose)',
      subtext: 'var(--oe-text-3)',
      iconColor: 'var(--oe-rose)',
    };
  }

  if (variant === 'ghost') {
    return {
      bg: hovered ? 'var(--oe-surf-2)' : 'transparent',
      border: '1px solid transparent',
      text: 'var(--oe-text-2)',
      subtext: 'var(--oe-text-3)',
      iconColor: 'var(--oe-text-3)',
    };
  }

  // secondary (default)
  return {
    bg: hovered ? 'var(--oe-surf-2)' : 'var(--oe-surf)',
    border: `1px solid ${hovered ? 'var(--oe-border)' : 'var(--oe-border-2)'}`,
    text: 'var(--oe-text-1)',
    subtext: 'var(--oe-text-3)',
    iconColor: 'var(--oe-text-2)',
  };
}

export default ActionPanel;
