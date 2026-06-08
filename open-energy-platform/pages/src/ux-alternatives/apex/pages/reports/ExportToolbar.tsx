/**
 * ExportToolbar — Apex Reports
 *
 * Compact toolbar row: PDF / XLSX / CSV export + schedule dropdown + print.
 * All buttons follow the Apex surface style (border + surf + hover lift).
 * No Tailwind. No hardcoded colors. CSS variables only.
 */

import React, { useState, useRef, useEffect } from 'react';
import { OeIcon } from '../../components/icons/Icons';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

interface ExportToolbarProps {
  reportId?: string;
  reportLabel?: string;
}

// ─── Shared button style ─────────────────────────────────────────────────────

function apexBtn(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'DM Sans, sans-serif',
    color: 'var(--oe-text-2)',
    background: 'var(--oe-surf)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-btn)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background var(--oe-t-fast) var(--oe-ease), box-shadow var(--oe-t-fast) var(--oe-ease)',
    flexShrink: 0,
    ...extra,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolbarBtn({
  label,
  iconName,
  onClick,
  active,
}: {
  label: string;
  iconName: React.ComponentProps<typeof OeIcon>['name'];
  onClick: () => void;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={apexBtn({
        background: active
          ? 'var(--oe-surf-2)'
          : hovered
          ? 'var(--oe-surf-2)'
          : 'var(--oe-surf)',
        boxShadow: hovered ? '0 1px 4px rgba(7,24,46,0.06)' : 'none',
        outline: 'none',
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      aria-pressed={active}
    >
      <OeIcon name={iconName} size={13} color="var(--oe-text-3)" />
      {label}
    </button>
  );
}

// ─── Schedule dropdown ───────────────────────────────────────────────────────

function ScheduleDropdown({ onClose }: { onClose: () => void }) {
  const [freq, setFreq] = useState<ScheduleFrequency>('weekly');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  function handleSave() {
    setSaved(true);
    setTimeout(onClose, 900);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--oe-text-3)',
    marginBottom: '4px',
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'DM Sans, sans-serif',
    color: 'var(--oe-text-1)',
    background: 'var(--oe-canvas)',
    border: '1px solid var(--oe-border)',
    borderRadius: 'var(--oe-r-input)',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        width: '240px',
        background: 'var(--oe-canvas)',
        border: '1px solid var(--oe-border)',
        borderRadius: 'var(--oe-r-card)',
        boxShadow: 'var(--oe-shadow-palette)',
        padding: '14px',
        zIndex: 'var(--oe-z-drawer)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--oe-text-1)',
          borderBottom: '1px solid var(--oe-border-2)',
          paddingBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <OeIcon name="clock" size={13} color="var(--oe-text-3)" />
        Schedule Report
      </div>

      <div>
        <label style={labelStyle} htmlFor="sched-freq">Frequency</label>
        <select
          id="sched-freq"
          value={freq}
          onChange={e => setFreq(e.target.value as ScheduleFrequency)}
          style={selectStyle}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div>
        <label style={labelStyle} htmlFor="sched-email">Recipient email</label>
        <input
          id="sched-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>

      <button
        onClick={handleSave}
        style={{
          ...apexBtn(),
          background: saved ? 'var(--oe-green-bg)' : 'var(--oe-navy-1)',
          color: saved ? 'var(--oe-green)' : 'var(--oe-canvas)',
          border: saved ? '1px solid var(--oe-green-ring)' : '1px solid var(--oe-navy-2)',
          justifyContent: 'center',
          padding: '7px 12px',
          fontWeight: 600,
          width: '100%',
        }}
      >
        <OeIcon
          name={saved ? 'check-circle' : 'send'}
          size={13}
          color={saved ? 'var(--oe-green)' : 'var(--oe-canvas)'}
        />
        {saved ? 'Scheduled' : 'Save Schedule'}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExportToolbar({ reportId, reportLabel }: ExportToolbarProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);

  function handleExport(_format: ExportFormat) {
    // export implementation pending
  }

  return (
    <div
      data-no-print
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--oe-text-3)',
          letterSpacing: '0.02em',
          marginRight: '2px',
          whiteSpace: 'nowrap',
        }}
      >
        Export as:
      </span>

      <ToolbarBtn label="PDF"  iconName="download" onClick={() => handleExport('pdf')}  />
      <ToolbarBtn label="XLSX" iconName="xlsx"     onClick={() => handleExport('xlsx')} />
      <ToolbarBtn label="CSV"  iconName="pdf"      onClick={() => handleExport('csv')}  />

      {/* Separator */}
      <span
        style={{
          width: '1px',
          height: '20px',
          background: 'var(--oe-border)',
          flexShrink: 0,
          marginInline: '2px',
        }}
      />

      {/* Schedule */}
      <div style={{ position: 'relative' }}>
        <ToolbarBtn
          label="Schedule"
          iconName="clock"
          onClick={() => setScheduleOpen(v => !v)}
          active={scheduleOpen}
        />
        {scheduleOpen && (
          <ScheduleDropdown onClose={() => setScheduleOpen(false)} />
        )}
      </div>

      {/* Print */}
      <ToolbarBtn
        label="Print"
        iconName="export"
        onClick={() => window.print()}
      />
    </div>
  );
}

export default ExportToolbar;
