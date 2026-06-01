/**
 * Universal Feature Detail Page pattern
 *
 * Every chain item (project, facility, order, incident, etc.) uses this layout:
 *   - Page header (title, ref, state pill, actions)
 *   - StateFlow (full width)
 *   - Two-column body:
 *       Left:  MetaCard + content slots (children)
 *       Right: ActionPanel + ChainMap + Timeline
 */

import React from 'react';
import { OeIcon, IconName } from './../../components/icons/Icons';
import { StatusPill, stateVariant, PillVariant } from './StatusPill';
import { StateFlow, StateFlowStep } from './StateFlow';
import { ChainMap, ChainLink } from './ChainMap';
import { ActionPanel, Action } from './../actions/ActionPanel';
import { Timeline, TimelineEvent } from './Timeline';
import { AIInsightCard, AIInsightCardProps } from './AIInsightCard';

export interface MetaField {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  span?: boolean;
}

export interface FeatureDetailPageProps {
  /** Display title e.g. "Boland Solar 120MW" */
  title: string;
  /** Chain reference e.g. "W20-P001" */
  ref_id?: string;
  /** Chain type label e.g. "Construction / COD" */
  chainType?: string;
  /** Current state */
  state: string;
  /** Override pill variant; defaults to stateVariant(state) */
  stateVariant?: PillVariant;
  /** State machine steps */
  steps: StateFlowStep[];
  /** Meta fields shown in the summary card */
  metaFields: MetaField[];
  /** Right-column chain links */
  chainLinks?: ChainLink[];
  /** Right-column available actions */
  actions?: Action[];
  actionsTitle?: string;
  /** Audit trail events */
  auditEvents?: TimelineEvent[];
  /** Optional AI insight for this record */
  aiInsight?: Omit<AIInsightCardProps, 'onAccept' | 'onDismiss'> & {
    onAccept?: () => void;
    onDismiss?: () => void;
  };
  /** Breadcrumb items shown above the page header */
  breadcrumbs?: { label: string; href?: string }[];
  /** Main body content (e.g. tabs with tables, charts) */
  children?: React.ReactNode;
  /** Header action buttons */
  headerActions?: React.ReactNode;
}

export function FeatureDetailPage({
  title,
  ref_id,
  chainType,
  state,
  stateVariant: stateVariantOverride,
  steps,
  metaFields,
  chainLinks = [],
  actions = [],
  actionsTitle,
  auditEvents = [],
  aiInsight,
  breadcrumbs = [],
  children,
  headerActions,
}: FeatureDetailPageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <OeIcon name="chevron-right" size={11} color="var(--oe-text-4)" />}
              {crumb.href ? (
                <a href={crumb.href} style={{ fontSize: '12px', color: 'var(--oe-text-3)', textDecoration: 'none' }}>{crumb.label}</a>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--oe-text-2)', fontWeight: 500 }}>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Page header */}
      <div
        style={{
          background: 'linear-gradient(160deg, rgba(230,240,255,0.5) 0%, rgba(255,255,255,0) 60%), var(--oe-canvas)',
          border: '1px solid var(--oe-border)',
          borderRadius: 'var(--oe-r-card)',
          padding: '18px 20px',
          boxShadow: 'var(--oe-shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1
                className="oe-grad-text"
                style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}
              >
                {title}
              </h1>
              <StatusPill
                label={state}
                variant={stateVariantOverride ?? stateVariant(state)}
                size="md"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
              {ref_id && (
                <span className="oe-mono" style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>
                  {ref_id}
                </span>
              )}
              {chainType && (
                <span style={{ fontSize: '11px', color: 'var(--oe-text-3)' }}>
                  {chainType}
                </span>
              )}
            </div>
          </div>
          {headerActions && (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
              {headerActions}
            </div>
          )}
        </div>

        {/* StateFlow */}
        <div style={{ marginTop: '18px' }}>
          <StateFlow steps={steps} />
        </div>
      </div>

      {/* Two-column body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Meta card */}
          <div
            style={{
              background: 'var(--oe-canvas)',
              border: '1px solid var(--oe-border)',
              borderRadius: 'var(--oe-r-card)',
              padding: '16px',
              boxShadow: 'var(--oe-shadow-card)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '14px 20px',
              }}
            >
              {metaFields.map((f, i) => (
                <div
                  key={i}
                  style={f.span ? { gridColumn: '1 / -1' } : undefined}
                >
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--oe-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                    {f.label}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--oe-text-1)',
                      fontFamily: f.mono ? '"JetBrains Mono", monospace' : 'inherit',
                      fontVariantNumeric: f.mono ? 'tabular-nums' : undefined,
                    }}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Content slots */}
          {children}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* AI insight */}
          {aiInsight && <AIInsightCard {...aiInsight} />}

          {/* Actions */}
          {actions.length > 0 && (
            <ActionPanel actions={actions} title={actionsTitle} />
          )}

          {/* Chain map */}
          {(chainLinks.length > 0 || chainType) && (
            <ChainMap
              chainLabel={title}
              chainType={chainType}
              currentState={state}
              links={chainLinks}
            />
          )}

          {/* Audit trail */}
          {auditEvents.length > 0 && (
            <div
              style={{
                background: 'var(--oe-canvas)',
                border: '1px solid var(--oe-border)',
                borderRadius: 'var(--oe-r-card)',
                overflow: 'hidden',
                boxShadow: 'var(--oe-shadow-card)',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--oe-border-2)',
                  background: 'var(--oe-surf)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--oe-text-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <OeIcon name="lock" size={12} />
                Audit Trail
              </div>
              <div style={{ padding: '12px 14px' }}>
                <Timeline events={auditEvents} maxVisible={4} compact />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FeatureDetailPage;
