/**
 * Apex Icon Set — 45 custom SVG icons
 * 16×16 viewport, 1.4–1.7px stroke, round caps/joins
 * No emoji, no icon fonts, no external dependencies
 *
 * Usage:
 *   import { OeIcon } from './Icons';
 *   <OeIcon name="search" size={14} color="currentColor" />
 *
 * Or use the sprite directly:
 *   <OeIconSprite />  (render once at root)
 *   <svg><use href="#oe-ic-search" /></svg>
 */

import React from 'react';

export type IconName =
  // Navigation
  | 'home' | 'calendar' | 'chart-line' | 'hierarchy' | 'folder' | 'blueprint'
  | 'checklist' | 'gate' | 'flag' | 'list' | 'leaf' | 'shield' | 'dollar'
  | 'scales' | 'tower' | 'lightning' | 'satellite' | 'wrench' | 'ticket'
  | 'gear' | 'bell' | 'grid-apps'
  // Actions
  | 'search' | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'plus'
  | 'export' | 'close' | 'check' | 'edit' | 'trash' | 'download' | 'upload'
  | 'eye' | 'send' | 'approve' | 'reject' | 'sign' | 'escalate' | 'drag'
  // Status
  | 'check-circle' | 'x-circle' | 'clock' | 'alert-triangle' | 'info-circle'
  | 'lock' | 'unlock' | 'dots-h'
  // Data
  | 'bar-chart' | 'pie-chart' | 'trend-up' | 'trend-down' | 'filter' | 'sort'
  | 'expand' | 'collapse' | 'link' | 'chain'
  // Reports
  | 'pdf' | 'xlsx' | 'report' | 'stamp' | 'certificate'
  // Roles
  | 'ipp' | 'lender' | 'offtaker' | 'trader' | 'carbon' | 'regulator' | 'grid'
  | 'esums' | 'oem';

const PATHS: Record<IconName, React.ReactNode> = {
  // ── Navigation ────────────────────────────────────────────
  home: (
    <>
      <path d="M2 8L8 2.5L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 7v6h3v-3h2v3h3V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  calendar: (
    <>
      <rect x="2" y="3.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="5" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="11" y1="2" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  'chart-line': (
    <>
      <polyline points="2,12 5.5,7.5 8.5,9.5 13.5,4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  hierarchy: (
    <>
      <rect x="6" y="1.5" width="4" height="3" rx=".8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="11.5" width="4" height="3" rx=".8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6" y="11.5" width="4" height="3" rx=".8" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="11" y="11.5" width="4" height="3" rx=".8" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="8" y1="4.5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="3" y1="8.5" x2="13" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="3" y1="8.5" x2="3" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8" y1="8.5" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="13" y1="8.5" x2="13" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  folder: (
    <path d="M2 5a1.5 1.5 0 011.5-1.5h2.3l1.4 1.5H12.5A1.5 1.5 0 0114 6.5v6A1.5 1.5 0 0112.5 14h-9A1.5 1.5 0 012 12.5V5z" stroke="currentColor" strokeWidth="1.4"/>
  ),
  blueprint: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6" y1="6" x2="6" y2="14" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="9.5" y1="8.5" x2="12" y2="8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="9.5" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="9.5" y1="12.5" x2="12" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </>
  ),
  checklist: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <polyline points="5,8 7,10 11,6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  gate: (
    <rect x="4" y="4" width="8" height="8" rx=".5" stroke="currentColor" strokeWidth="1.4" transform="rotate(45 8 8)"/>
  ),
  flag: (
    <>
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 3h7.5l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  list: (
    <>
      <circle cx="3.5" cy="5" r="1" fill="currentColor"/>
      <circle cx="3.5" cy="8" r="1" fill="currentColor"/>
      <circle cx="3.5" cy="11" r="1" fill="currentColor"/>
      <line x1="6.5" y1="5" x2="13.5" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6.5" y1="11" x2="13.5" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  leaf: (
    <>
      <path d="M12 2C12 2 13.5 8.5 8 11C4 13 2 14 2 14C2 14 4.5 8 7 6C9 4.5 12 2 12 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="2" y1="14" x2="6" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  shield: (
    <>
      <path d="M8 2L3 4.5v4.2C3 11.5 5 13.5 8 14.5c3-1 5-3 5-5.8V4.5L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="5.5,8.5 7,10 10.5,6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  dollar: (
    <>
      <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11 4.5H6.5A2 2 0 004.5 6.5v0A2 2 0 006.5 8.5h3A2 2 0 0111.5 10.5v0A2 2 0 019.5 12.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  scales: (
    <>
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M2 5l-1 3.5 3.5 1.5 3.5-1.5L6.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 5l1 3.5-3.5 1.5-3.5-1.5L9.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  tower: (
    <>
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 8l-2 5M11 8l2 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3.5 6.5C3.5 4.5 5.5 3 8 3s4.5 1.5 4.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <path d="M5.5 9.5C5.5 8.2 6.7 7 8 7s2.5 1.2 2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    </>
  ),
  lightning: (
    <path d="M9.5 2L4 9h4.5L6.5 14l7-7H9L9.5 2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  satellite: (
    <>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 5L2.5 2.5M11 5l2.5-2.5M5 11l-2.5 2.5M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  wrench: (
    <path d="M13.5 2.5a3 3 0 00-4 4L3.5 12.5a1.5 1.5 0 002 2L11.5 8.5a3 3 0 004-4l-2 2-1.5-1.5 2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  ticket: (
    <>
      <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="9" y1="4" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5"/>
      <line x1="4" y1="7" x2="7" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="4" y1="9.5" x2="6" y2="9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  gear: (
    <>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.6 3.6l.85.85M11.55 11.55l.85.85M3.6 12.4l.85-.85M11.55 4.45l.85-.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  bell: (
    <>
      <path d="M8 2a4.5 4.5 0 00-4.5 4.5V9l-1.5 2h12l-1.5-2V6.5A4.5 4.5 0 008 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  'grid-apps': (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </>
  ),

  // ── Actions ────────────────────────────────────────────────
  search: (
    <>
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  'chevron-down': (
    <polyline points="3,6 8,11 13,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  'chevron-right': (
    <polyline points="6,3 11,8 6,13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  'chevron-left': (
    <polyline points="10,3 5,8 10,13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  plus: (
    <>
      <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </>
  ),
  export: (
    <>
      <path d="M5 6L8 3L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="8" y1="3" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  close: (
    <>
      <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </>
  ),
  check: (
    <polyline points="3,8 7,12 13,5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  edit: (
    <>
      <path d="M11 3L13 5L6 12H4v-2L11 3z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  trash: (
    <>
      <path d="M3 5h10M6 5V3.5h4V5M5.5 5l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  download: (
    <>
      <path d="M11 10L8 13L5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="8" y1="13" x2="8" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 14h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  upload: (
    <>
      <path d="M5 6L8 3L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="8" y1="3" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 14h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  eye: (
    <>
      <path d="M2 8C3.5 5 5.5 3.5 8 3.5S12.5 5 14 8c-1.5 3-3.5 4.5-6 4.5S3.5 11 2 8z" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
    </>
  ),
  send: (
    <path d="M14 2L9 14L7 9L2 7L14 2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  approve: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <polyline points="5,8 7,10 11,6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  reject: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </>
  ),
  sign: (
    <>
      <path d="M4 12c1-2 2-4 3-4s1.5 1 1 2-1 2 0 2 2-1 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M10 3l1.5 1.5-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  escalate: (
    <>
      <path d="M8 3v8M5 6l3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  drag: (
    <>
      <circle cx="5.5" cy="5" r="1.2" fill="currentColor"/>
      <circle cx="10.5" cy="5" r="1.2" fill="currentColor"/>
      <circle cx="5.5" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="10.5" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="5.5" cy="11" r="1.2" fill="currentColor"/>
      <circle cx="10.5" cy="11" r="1.2" fill="currentColor"/>
    </>
  ),

  // ── Status ─────────────────────────────────────────────────
  'check-circle': (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <polyline points="5,8 7,10 11,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'x-circle': (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <polyline points="8,5 8,8 10.5,10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'alert-triangle': (
    <>
      <path d="M8 3L14 13H2L8 3z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11.5" r="0.8" fill="currentColor"/>
    </>
  ),
  'info-circle': (
    <>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="8" y1="7" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="5.2" r="0.8" fill="currentColor"/>
    </>
  ),
  lock: (
    <>
      <rect x="4" y="8" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 8V6a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="1" fill="currentColor"/>
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="8" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 8V6a2.5 2.5 0 015 0v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="8" cy="11" r="1" fill="currentColor"/>
    </>
  ),
  'dots-h': (
    <>
      <circle cx="4" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="12" cy="8" r="1.2" fill="currentColor"/>
    </>
  ),

  // ── Data ────────────────────────────────────────────────────
  'bar-chart': (
    <>
      <rect x="2" y="8" width="3" height="6" rx=".5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6.5" y="5" width="3" height="9" rx=".5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="11" y="2" width="3" height="12" rx=".5" stroke="currentColor" strokeWidth="1.3"/>
    </>
  ),
  'pie-chart': (
    <>
      <path d="M8 2A6 6 0 108 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 2v6h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'trend-up': (
    <>
      <polyline points="2,12 6,7 9.5,10 14,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="11,4 14,4 14,7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  'trend-down': (
    <>
      <polyline points="2,4 6,9 9.5,6 14,12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="11,12 14,12 14,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  filter: (
    <>
      <path d="M2 4h12l-4.5 5.5V13l-3-1.5V9.5L2 4z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  sort: (
    <>
      <line x1="3" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),
  expand: (
    <>
      <polyline points="3,9 3,13 7,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="13,7 13,3 9,3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="3" y1="13" x2="7" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="13" y1="3" x2="9" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </>
  ),
  collapse: (
    <>
      <polyline points="4,12 8,8 12,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="4,8 8,4 12,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),
  link: (
    <>
      <path d="M6.5 9.5a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2L7.3 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9.5 6.5a3 3 0 00-4.2 0l-2 2a3 3 0 004.2 4.2l1.2-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  chain: (
    <>
      <path d="M4 8a3 3 0 000 4.2l.8.8A3 3 0 009 13h0a3 3 0 002.1-.9l.9-.9A3 3 0 0012 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M12 8a3 3 0 000-4.2l-.8-.8A3 3 0 007 3h0a3 3 0 00-2.1.9L4 4.8A3 3 0 004 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </>
  ),

  // ── Reports ─────────────────────────────────────────────────
  pdf: (
    <>
      <path d="M10 2H4a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5V6L10 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <polyline points="10,2 10,6 13.5,6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="11.5" x2="9" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </>
  ),
  xlsx: (
    <>
      <path d="M10 2H4a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5V6L10 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <polyline points="10,2 10,6 13.5,6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="8" y1="8" x2="8" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </>
  ),
  report: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </>
  ),
  stamp: (
    <>
      <rect x="3" y="9" width="10" height="3" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 9V7a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </>
  ),
  certificate: (
    <>
      <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="6" y1="13" x2="6" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="10" y1="13" x2="10" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M6 13l-.5 1.5.5-.5.5.5L6 13zM10 13l-.5 1.5.5-.5.5.5L10 13z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </>
  ),

  // ── Role identifiers (stylised initials) ────────────────────
  ipp:       <text x="3" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">IP</text>,
  lender:    <text x="2.5" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">LN</text>,
  offtaker:  <text x="2" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">OT</text>,
  trader:    <text x="3" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">TR</text>,
  carbon:    <text x="2.5" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">CF</text>,
  regulator: <text x="2.5" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">RG</text>,
  grid:      <text x="3" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">GR</text>,
  esums:     <text x="3" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">ES</text>,
  oem:       <text x="2.5" y="12" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="currentColor">OM</text>,
};

interface OeIconProps {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

export function OeIcon({ name, size = 16, color = 'currentColor', className = '', title }: OeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={!title}
      aria-label={title}
      role={title ? 'img' : 'presentation'}
      className={className}
      style={{ color, flexShrink: 0, display: 'block' }}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/** Inline SVG sprite sheet — render once near the root */
export function OeIconSprite() {
  return (
    <svg style={{ display: 'none' }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        {(Object.keys(PATHS) as IconName[]).map((name) => (
          <symbol key={name} id={`oe-ic-${name}`} viewBox="0 0 16 16">
            {PATHS[name]}
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export default OeIcon;
