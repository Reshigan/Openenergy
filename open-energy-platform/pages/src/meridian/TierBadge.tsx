// v2 tier badge — Foundation · L3 / Professional · L4 / Regulator-grade · L5.
// Mono uppercase pill, tinted per tier. Pure, no deps. Used by per-role surfaces
// to flag a journey's feature-depth rubric tier (see CLAUDE.md "Feature-depth rubric").
export type Tier = "foundation" | "professional" | "regulator";

const LABEL: Record<Tier, string> = {
  foundation: "Foundation · L3",
  professional: "Professional · L4",
  regulator: "Regulator-grade · L5",
};

// v2 tier colours: L3 cyan, L4 green, L5 brown — each paired with a soft tint.
const TONE: Record<Tier, { fg: string; bg: string; border: string }> = {
  foundation: { fg: "#0e7490", bg: "#e0f2f7", border: "rgba(14,116,144,0.30)" },
  professional: { fg: "#1f6f54", bg: "#e1efe9", border: "rgba(31,111,84,0.30)" },
  regulator: { fg: "#7c3a12", bg: "#f1e4d6", border: "rgba(124,58,18,0.30)" },
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const t = TONE[tier];
  return (
    <span
      className={`tier-badge${className ? ` ${className}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 999,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {LABEL[tier]}
    </span>
  );
}