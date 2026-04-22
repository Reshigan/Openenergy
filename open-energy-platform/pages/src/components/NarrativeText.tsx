import React, { useMemo } from 'react';

// Lightweight renderer for the markdown-ish text our LLM prompts return.
// Supports:
//   # H1 / ## H2 / ### H3
//   - bullet / * bullet / 1. ordered
//   **bold** / *italic* / `inline code`
//   > blockquote
//   blank-line-separated paragraphs
//   ``` fenced code blocks ```
//
// Designed to keep report output looking professional (headings, bullets,
// bold) rather than dumping the raw markdown syntax into a <pre>.

type Token =
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' };

function tokenize(src: string): Token[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Token[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      out.push({ type: 'code', text: buf.join('\n') });
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = (trimmed.match(/^#+/) || ['#'])[0].length as 1 | 2 | 3;
      out.push({ type: 'h', level: level > 3 ? 3 : level, text: trimmed.replace(/^#+\s+/, '').trim() });
      i++;
      continue;
    }

    if (/^[-*]{3,}$/.test(trimmed)) {
      out.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push({ type: 'ol', items });
      continue;
    }

    // Paragraph — consume until blank line or a new block marker.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('```') &&
      !/^[-*]{3,}$/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) out.push({ type: 'p', text: buf.join(' ') });
  }
  return out;
}

// Inline renderer — bold, italic, inline code, links.
function renderInline(src: string): React.ReactNode[] {
  // Pattern alternation: code first (so ** inside code is literal), then
  // bold, italic, link. Everything else is plain text.
  const parts: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push(src.slice(last, m.index));
    if (m[1]) {
      parts.push(
        <code
          key={`c${key++}`}
          className="px-1 py-[1px] rounded font-mono text-[12px]"
          style={{ background: '#eef0f3', color: '#32363a' }}
        >
          {m[1]}
        </code>,
      );
    } else if (m[2]) {
      parts.push(
        <strong key={`b${key++}`} className="font-semibold" style={{ color: '#1a2033' }}>
          {m[2]}
        </strong>,
      );
    } else if (m[3]) {
      parts.push(
        <em key={`i${key++}`} className="italic">
          {m[3]}
        </em>,
      );
    } else if (m[4] && m[5]) {
      parts.push(
        <a
          key={`a${key++}`}
          href={m[5]}
          target="_blank"
          rel="noreferrer"
          className="underline"
          style={{ color: '#5d36ff' }}
        >
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push(src.slice(last));
  return parts;
}

export interface NarrativeTextProps {
  text: string | null | undefined;
  className?: string;
  tone?: 'default' | 'card' | 'bubble';
  emptyLabel?: string;
}

// Render the LLM narrative as properly-styled rich text. The component is
// deliberately dependency-free (no react-markdown) to keep the bundle thin,
// since the grammar we feed the model is small and predictable.
export function NarrativeText({ text, className, tone = 'default', emptyLabel }: NarrativeTextProps) {
  const tokens = useMemo(() => tokenize((text || '').trim()), [text]);

  if (!text || !text.trim() || tokens.length === 0) {
    return emptyLabel ? (
      <div className="text-[13px]" style={{ color: '#6a6d70' }}>
        {emptyLabel}
      </div>
    ) : null;
  }

  const container =
    tone === 'card'
      ? 'rounded-md border p-4 bg-white'
      : tone === 'bubble'
        ? 'rounded-md p-3'
        : '';
  const containerStyle =
    tone === 'card'
      ? { borderColor: '#e5e5e5' }
      : tone === 'bubble'
        ? { background: '#f7f8f9' }
        : {};

  return (
    <div
      className={`text-[13px] leading-relaxed space-y-2 ${container} ${className || ''}`.trim()}
      style={{ color: '#32363a', ...containerStyle }}
    >
      {tokens.map((tok, idx) => {
        if (tok.type === 'h') {
          const size =
            tok.level === 1 ? 'text-[16px]' : tok.level === 2 ? 'text-[14px]' : 'text-[13px]';
          return (
            <div
              key={idx}
              className={`${size} font-semibold`}
              style={{
                color: '#1a2033',
                marginTop: idx === 0 ? 0 : 10,
                marginBottom: 2,
              }}
            >
              {renderInline(tok.text)}
            </div>
          );
        }
        if (tok.type === 'p') {
          return (
            <p key={idx} className="leading-relaxed">
              {renderInline(tok.text)}
            </p>
          );
        }
        if (tok.type === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 marker:text-[#9096a0]">
              {tok.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (tok.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1 marker:text-[#9096a0]">
              {tok.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        if (tok.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="pl-3 py-1 text-[12.5px] italic"
              style={{ borderLeft: '3px solid #d0d5dd', color: '#4a4e55' }}
            >
              {renderInline(tok.text)}
            </blockquote>
          );
        }
        if (tok.type === 'code') {
          return (
            <pre
              key={idx}
              className="rounded-md p-3 overflow-x-auto text-[12px] leading-relaxed font-mono"
              style={{ background: '#f4f5f7', color: '#1a2033' }}
            >
              {tok.text}
            </pre>
          );
        }
        if (tok.type === 'hr') {
          return <hr key={idx} style={{ borderColor: '#e5e5e5', margin: '6px 0' }} />;
        }
        return null;
      })}
    </div>
  );
}

export default NarrativeText;
