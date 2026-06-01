// CommandLens — Direction 3 root.
//
// The workstation IS the command bar. Empty state shows hint sidebar +
// recent-actions log. Type to filter / preview / act. Power users live
// here; new users follow the sidebar templates.
//
// Keyboard:
//   /         focus bar (when not already focused)
//   ⌘K        open the modal palette (advanced commands too)
//   ⏎        confirm preview / submit query
//   esc       clear current query
//   ⌘⇧D       toggle density
//   ↑/↓      navigate result rows

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DensityProvider, useDensity } from '../shared/DensityContext';
import { SAMPLE_CHAIN_DATA, ChainRow, computeStateOfWorld, STATUS_LABEL, TIER_LABEL, slaColor, healthColor } from '../shared/SampleChainData';
import '../shared/animations.css';
import { NLCommandBar, parseQuery, ParseResult, SUGGESTIONS } from './NLCommandBar';
import { ActionPreview } from './ActionPreview';
import { CommandPalette, PaletteCommand, useCommandPaletteHotkey } from '../shared/CommandPalette';
import { PrototypeShell, StateStrip, ConfirmModal } from '../shared/primitives';
import { PulseDrawer } from '../pulse-lens/PulseDrawer';

interface RecentEntry {
  ts: number;
  label: string;
  verb?: string;
}

function CommandLensBody() {
  const { density, toggle } = useDensity();
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<ParseResult>({ kind: 'idle' });
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [drawerRow, setDrawerRow] = useState<ChainRow | null>(null);

  useCommandPaletteHotkey(setPaletteOpen);

  const world = useMemo(() => computeStateOfWorld(SAMPLE_CHAIN_DATA), []);

  // Live-parse as user types.
  useEffect(() => {
    setParsed(parseQuery(query));
    setActiveIdx(0);
  }, [query]);

  const onSubmit = useCallback(() => {
    if (parsed.kind === 'preview' && parsed.action) {
      const { verb, target } = parsed.action;
      if (verb === 'revoke') {
        setConfirmRevoke(true);
        return;
      }
      if (verb === 'open') {
        setDrawerRow(target);
        setRecent((r) => [{ ts: Date.now(), label: `Opened ${target.number}`, verb: 'open' }, ...r].slice(0, 12));
        setQuery('');
        return;
      }
      // suspend / failover stub
      setRecent((r) => [{ ts: Date.now(), label: `${verb.toUpperCase()} ${target.number}`, verb }, ...r].slice(0, 12));
      setQuery('');
      return;
    }
    if (parsed.kind === 'list' && parsed.list && parsed.list[activeIdx]) {
      const target = parsed.list[activeIdx];
      setDrawerRow(target);
      setRecent((r) => [{ ts: Date.now(), label: `Opened ${target.number} from list`, verb: 'open' }, ...r].slice(0, 12));
    }
  }, [parsed, activeIdx]);

  const onEscape = useCallback(() => {
    if (query) setQuery('');
    else setDrawerRow(null);
  }, [query]);

  // "/" focuses bar when nothing else focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const isInInput = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      if (!isInInput && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Natural-language command"]')?.focus();
      } else if (parsed.kind === 'list' && !isInInput) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => Math.min((parsed.list?.length ?? 1) - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parsed]);

  // Same global key handlers in input as well — ArrowDown/Up should still
  // navigate the result list even when the input has focus.
  useEffect(() => {
    if (parsed.kind !== 'list') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && tgt.tagName === 'INPUT') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIdx((i) => Math.min((parsed.list?.length ?? 1) - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIdx((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parsed]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = SUGGESTIONS.map((s, i) => ({
      id: `sug-${i}`, group: 'Templates', label: s, run: () => setQuery(s),
    }));
    cmds.push({ id: 'density', group: 'View', label: 'Toggle density', shortcut: '⌘⇧D', run: toggle });
    for (const r of SAMPLE_CHAIN_DATA) {
      cmds.push({
        id: `open-${r.id}`, group: 'Open connector',
        label: `${r.number} — ${r.substation}`,
        hint: `${STATUS_LABEL[r.status]} · ${TIER_LABEL[r.tier]}`,
        run: () => { setDrawerRow(r); },
      });
    }
    return cmds;
  }, [toggle]);

  return (
    <PrototypeShell title="Command Lens" subtitle="Type-first workstation · natural-language command bar">
      <StateStrip
        world={world}
        density={density}
        onToggleDensity={toggle}
        filterLabel={parsed.kind === 'idle' ? 'idle' : parsed.kind === 'list' ? `${parsed.list?.length ?? 0} results` : parsed.kind === 'preview' ? 'preview' : 'no match'}
      />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 32px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32 }}>
        <div>
          <NLCommandBar
            value={query}
            onChange={setQuery}
            onSubmit={onSubmit}
            onEscape={onEscape}
            autoFocus
          />

          {parsed.kind === 'idle' && (
            <div style={{ marginTop: 18, fontSize: 13, color: '#525a66', lineHeight: 1.55 }}>
              Type any of the templates on the right, or a substation name, status keyword, or verb.
              Submit with <kbd style={kbdInline}>⏎</kbd>; clear with <kbd style={kbdInline}>esc</kbd>.
            </div>
          )}
          {parsed.kind === 'preview' && parsed.action && (
            <ActionPreview
              action={parsed.action}
              onConfirm={onSubmit}
              onCancel={() => setQuery('')}
            />
          )}
          {parsed.kind === 'list' && parsed.list && (
            <ResultList
              rows={parsed.list}
              activeIdx={activeIdx}
              label={parsed.listLabel ?? ''}
              onSelect={(r, i) => { setActiveIdx(i); setDrawerRow(r); }}
            />
          )}
          {parsed.kind === 'unknown' && (
            <div
              style={{
                marginTop: 18, padding: 18, background: '#fff', border: '1px solid #dde4ec', borderRadius: 12,
                color: '#525a66', fontSize: 13.5, lineHeight: 1.55,
              }}
            >
              {parsed.message}
            </div>
          )}
        </div>

        <aside>
          <div style={{ fontSize: 11, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, marginBottom: 8 }}>
            Templates
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="oe-btn"
                onClick={() => setQuery(s)}
                style={{
                  padding: '6px 10px',
                  background: '#fff',
                  border: '1px solid #dde4ec',
                  borderRadius: 6,
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#1a3a5c',
                  fontWeight: 500,
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24, fontSize: 11, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, marginBottom: 8 }}>
            Recent
          </div>
          {recent.length === 0 && <div style={{ fontSize: 12, color: '#6b7685', fontStyle: 'italic' }}>None yet.</div>}
          {recent.map((r, i) => (
            <div key={r.ts + '-' + i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px dashed #eef2f6' }}>
              <span style={{ color: r.verb === 'revoke' ? '#c0392b' : '#0f1c2e' }}>{r.label}</span>
              <span style={{ color: '#6b7685', fontFamily: 'ui-monospace, monospace', fontSize: 10.5 }}>
                {fmtAgo(r.ts)}
              </span>
            </div>
          ))}
        </aside>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      <PulseDrawer
        row={drawerRow}
        onClose={() => setDrawerRow(null)}
      />

      <ConfirmModal
        open={confirmRevoke}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => {
          if (parsed.kind === 'preview' && parsed.action) {
            const t = parsed.action.target;
            setRecent((r) => [{ ts: Date.now(), label: `REVOKED ${t.number}`, verb: 'revoke' }, ...r].slice(0, 12));
          }
          setConfirmRevoke(false);
          setQuery('');
        }}
        title="Revoke SCADA connector?"
        body={
          <>This will mark the connector as REVOKED and is reportable under NERSA Grid Code C-3 + SARB BA 700. Cascades to W26 + W67 + W118.</>
        }
        confirmLabel="Revoke connector"
      />
    </PrototypeShell>
  );
}

const kbdInline: React.CSSProperties = {
  background: '#fff', border: '1px solid #c5cdd6', padding: '1px 5px', borderRadius: 4,
  fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
};

function ResultList({
  rows, activeIdx, label, onSelect,
}: { rows: ChainRow[]; activeIdx: number; label: string; onSelect: (r: ChainRow, i: number) => void }) {
  return (
    <div style={{ marginTop: 16, background: '#fff', border: '1px solid #dde4ec', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #e3e8ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#525a66' }}>
        <span>{rows.length} results · {label}</span>
        <span style={{ color: '#6b7685' }}>
          <kbd style={kbdInline}>↑↓</kbd> nav · <kbd style={kbdInline}>⏎</kbd> open
        </span>
      </div>
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {rows.map((r, i) => {
          const active = i === activeIdx;
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={-1}
              onMouseEnter={() => onSelect(r, i)}
              onClick={() => onSelect(r, i)}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 110px 100px 90px 80px',
                alignItems: 'center',
                padding: '8px 14px',
                background: active ? '#e7f0f9' : 'transparent',
                borderLeft: active ? '2px solid #1a3a5c' : '2px solid transparent',
                cursor: 'pointer',
                borderTop: '1px solid #eef2f6',
                fontSize: 12.5,
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#1a3a5c' }}>{r.number}</span>
              <span>{r.substation}</span>
              <span style={{ color: healthColor(r.health), fontWeight: 600 }}>{STATUS_LABEL[r.status]}</span>
              <span>{TIER_LABEL[r.tier]}</span>
              <span className="oe-num" style={{ color: slaColor(r.sla_pct_remaining), fontWeight: 700 }}>
                {r.sla_target_hours > 0 ? (r.sla_breached ? 'BRCH' : r.sla_pct_remaining + '%') : '—'}
              </span>
              <span className="oe-num">{r.capacity_mva}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function CommandLens() {
  return (
    <DensityProvider>
      <CommandLensBody />
    </DensityProvider>
  );
}
