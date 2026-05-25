// ═══════════════════════════════════════════════════════════════════════════
// Design Gallery — pairs each of the 047 role workbench surfaces with a
// reference design from the Stitch design system (project
// 2724118800035624930 "NXT Open Energy Platform").
//
// Each card shows the screenshot thumbnail (served from Google's user-
// content CDN — allowed by the SPA CSP via the img-src directive) plus the
// matching new SPA route. Designers can compare the live React render with
// the hi-fi mock and pull through any patterns we haven't yet built.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LtmLogo } from '../LtmLogo';

type Persona =
  | 'IPP' | 'Offtaker' | 'Lender' | 'Carbon Fund' | 'Grid Operator'
  | 'Regulator' | 'Trader' | 'Cross-role';

interface StitchScreen {
  /** Stitch screen ID within project 2724118800035624930 */
  id: string;
  title: string;
  /** Which 047 SPA tab the design illuminates. */
  persona: Persona;
  /** SPA route the design maps to. */
  route: string;
  /** Short rationale shown under the card title. */
  reads: string;
  /** Direct screenshot URL (Google CDN). Stable while the screen lives. */
  thumb: string;
}

const SCREENS: StitchScreen[] = [
  {
    id: '4985736dfad84923a2f5ce9eebde6d3f',
    title: 'Lender Monitoring Dashboard',
    persona: 'Lender',
    route: '/lender-suite',
    reads: 'Covenant health · disbursement queue · exposure tiles. Pairs with the new credit-risk / ECL tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uhDrw4xuWbqMaBMfpF0l2g4ZH3BZ1sJimbHsvy5hxMhfa-bNVxyTBhIW2r03BT7hI95h56hqBGgQ1ioYBskqoo8trmn_tdTvgmWhIbjlomQEI4hpPMCBN0PYU5STy25Cb5ud9PNGNnvJ-O2Y-0671WV0QMCvlcHsDx3eEOMv8udxp8RYs80yQXO-tE64I3xP6elA-iZKI6uiqGWJGAYGtJY-SigABRRIdmMRwSoDHHozNmOUEVEl-m1gFU',
  },
  {
    id: 'a737fea621d34e36beb1361a5e589ea6',
    title: 'Risk Analytics',
    persona: 'Lender',
    route: '/lender-suite',
    reads: 'PD × LGD × EAD bands · IFRS 9 stage waterfall. Reference for the new "Credit risk (PD/LGD)" and "IFRS 9 ECL" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uiJZaMCxVEP1oiI8xNe-KbjwD67LsiMX34b7HTQx98Vh6qXPstC1DODsDiel2QWWq0gNFZYOlUpYWiq24KYzHvQKPUOQ_8ed8Q8KgGUR3XO9I1X0lb4R-NQVcOxwkfKSRKQYR43nHCnuJylblmJQhtp513W-xcy2dnbSIYU-8RsZEOxA0kXBqSEZR4ZxzwoQ4mCepu0jNNIVLSPgwunPuIkOVax_s4QV_OEp8Dr4_KlvFRUn3frDFC3qQk',
  },
  {
    id: 'be94f4317a4e4549934e73f44a2affe1',
    title: 'Market Risk Management',
    persona: 'Trader',
    route: '/trader-risk',
    reads: 'VaR / ES heatmaps · limit utilisation gauges. Reference for the new "Risk limits" + "VaR / ES" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uiteHpyH_y6dPMkoSjiqrUBPDvdJNXEsv8kmIoEeGe2fqwhhYVJ-Ac5C7IRrOKnjzQfR0W6dH2NGjNl_UAtpZjEipjVrF1kBQ8sG_XvJBHuxB6ZFm5-NK9352HpY2kGpzUMSaZxfSOgMhA8ITZ-UqWnjcTr9_WceC56OnzxorkV5wdDwWE9HvVOI6KLaCL7UtN8IGf5R9kmwGByXX5ktwTdfITBlKiO2uGslROXnZmSgwq8yAczLafwlwI',
  },
  {
    id: 'bdd1587ce2ae47a69de8227c73ed8211',
    title: 'Trader: Algo Trading Rules',
    persona: 'Trader',
    route: '/trader-risk',
    reads: 'Rule library · trigger conditions · status pills. Reference for the new "Hedging strategies" tab.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ujZ8CoulUMBdMX2LQQ8VqOqlkxQWBgvKXLkPMxxHRMAYAf9PtyWNgPa54a3xeUO8FKFAzm5PZotk_56F_nc6QwAyLpZinbZi-hnqLxWIAt6W7iUKOLuIdjcfxAyMJWgy_O-uSFdD9qxHNS8p40tBGTPRD3IeEm1Bj2iPufH9M4ubyP_R-k-LCktpRtcRpIDbY-uG-E3BfIpJK6hp_TXGfywlKe1pVeS9MQqTJE3HYBpwE3ZKeS_iccPAQ',
  },
  {
    id: '4ac088d4396b4f278108b06aff2efa78',
    title: 'Trader: Strategy Backtester',
    persona: 'Trader',
    route: '/trader-risk',
    reads: 'P&L attribution decomposition (realised + Greeks + carry + FX). Reference for the new "P&L attribution" tab.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uh3HSGqaNcRpl5c1qCx-_smPtUltGYKE6AuRJ1uasfwGL6dsrLJTbOblimShFaS2NX9Us8rVq2ZOF7YpM2qVEDDs-g9q6SzDG7A4DoLplpiFfBg-9aSnf6PsTW7NSs-fGOxrRS5aFJMdLK-j4WMZfmajdwK9HcsBC0Q_9KJoz92_ojLyyiBYQ32ApEG_oV3OV9pB7IeA9m8CVW8aa1FJ9mSsYbMtl6GOaISA50zfDSJvvqXQb6uyzC2_w',
  },
  {
    id: '78192d003b774f6b98ed9b899155edbc',
    title: 'Trader: Real-Time Blotter',
    persona: 'Trader',
    route: '/trader-risk',
    reads: 'Live position blotter with Greeks columns. Reference for the new "Options book" tab.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uhYRch5leW0eZoa57SftzgNHFyNZPQV5AVUqmWxZNZSFmLL84AR0W4qUV-96rCaD-AKVjVaN03cOHOLcn1TjL9DtjaGplV3POKVnEPNo6RaIDmQLjNYYfUV7FA5UnqK42qXr15vmscGyfuihhX5fNWCi5SoOGM-WQ3S0vi2caU1jm6zX3vbi2Qhp2nsqN3hB5DvsbSRvVyeZweoKIrMNGeEytKgv-Hd825mT3Liw1VWEVQPfizuR6eVNQ',
  },
  {
    id: '25824ceaa83e49eebf91b1fc25f4ead6',
    title: 'Carbon Fund Portfolio',
    persona: 'Carbon Fund',
    route: '/carbon-registry',
    reads: 'GAV → NAV → NAV-per-unit trumpet view. Reference for the new "NAV history" + "LPs" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uhd_WcUkZH-K3LCRr0h4mHRvYrQokqFeY1tuNFR_SeVZM6zKIic7B3_j7egFNcRiYmJI-65d2ZK0GLADH0s4lhGHQw97VBIiYKFIpuKOOEOiyb7kpv2dPzZMXtgDtz_kHq_Y1S_UEkc-LqMG35-MA-X-0c1DuRE5yIFBfthGK_OqjMKz78aHQsQw9GOTMfzFmbK4OjHZQUunbG9A8IldOgK-LApOVaBQoGHIZL3roOow3q6HF9Mw7zzPA',
  },
  {
    id: 'ddf89ff5f59b42ce9fefd29106de9f0e',
    title: 'Carbon Issuance Pipeline',
    persona: 'Carbon Fund',
    route: '/carbon-registry',
    reads: 'Sourcing → DD → term sheet → signed funnel. Reference for the new "Deal pipeline" + "Term sheets" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ujO3C8cEE9mRwWeCZB-KSk5G_RxMHGIhjygC5xCb_sygjFl0eX_3Ne3P-eCzV-XoZNhFFT4wghiKYUL59RVmQ5NYWGP5e8-mGS7m6H87Gjkf_iLn-AESV85CiY3-6Uh4IIdFzaMLEz3YuQrcffr3Pv0jOv-T-j16D3Rd1mz-b2hN2HIpAgVlXbVh9B1ZOrIya4ZRn5KBO-BDhvFScrVJdjYUyvn8DwxAIUYQ9mo2i4vXhLQsjUXiXCNA24',
  },
  {
    id: 'da2e334d7aac475188b510ca4c34e852',
    title: 'Carbon Lifecycle & Retirement',
    persona: 'Carbon Fund',
    route: '/carbon-registry',
    reads: 'Vintage → verification → retirement timeline. Reference for the new "Co-benefits (SDG)" tab.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ug0MDIKgP_rG9qCj_okqdJKDSEkqoNcxv2ZmPlRuvv3BatK2ofmUEcAoa9mukAH0zVGWmvxA_RIz5iZLB2zSSz3VziuVdFLcdeUVCPOHsT3rW9w1UCBrvhmssRm6E8Pa36yGwCnXknZGy6pGe-HRtrv4tooFvlS3qNBm9yBMaLeIhcc5vm4msK9cRYek7v6_RPwLfocuO82z1adNmnd8N-EW1kw-EN_yHaWZnKNahv3kG2AOTV7REg8kg',
  },
  {
    id: 'a3fd787168c24cb09c288832d07ed9be',
    title: 'Grid Code Compliance Monitor',
    persona: 'Grid Operator',
    route: '/grid-operator',
    reads: 'N-1 contingency outcomes · voltage band heatmap. Reference for the new "Contingency (N-1)" + "Reactive dispatch" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uh8MyJCBe-vVizHllPBpY0qrHGgi0Kv0CrEwrvVqyYR5kzDhE6x6FS9dupd599zOFPRLErlDxI5IYct3w-jFw3qTnqFbleTswM-k9F3f3GZEH64rEuzJg5Ld6Tevz4AfUPIOZ7a7aL6StrdbRN3r8xuBfTV4753JC9xO3CG9rAD38-rzUsUDJ-Gy-BvGUSvPb69uEkkpQBe6u-5bWWTcfnRZi4WkAQwydujU1_Xzek8AXFU3JscJcEuMtM',
  },
  {
    id: '05070dea4c944db1ab6be42024696091',
    title: 'Generator: Asset Monitoring',
    persona: 'Grid Operator',
    route: '/grid-operator',
    reads: 'SCADA telemetry · fault feed · 24-hour gen profile. Reference for the new "SCADA snapshots" + "Dispatch schedules" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ujnp4wozTvwWOHZiBU-jJNSDeiUcmy1mzPwaVphhxM6wTnN4UjcDDps5mT43xqjOr9NKgnMOhbxLpN75lDXRQfTCS1TFS7yUZydmwwIPers5DxGzhnVMmntnwsR8iDroGHp_YwifYGYtCcgiiIJD63HxJK4B7LLRxVVRRM2JMD-ITydvbry_Nl2OENWx1yTfMyE1pUjGFUcdXJD54EGTgF6a94-DsuH4zZzjJ7oDMl-kFbISMkDfevC3u4',
  },
  {
    id: '582f2b5254cd40488f5944e52f09e946',
    title: 'IPP Developer: Pipeline Manager',
    persona: 'IPP',
    route: '/ipp-lifecycle',
    reads: 'Site assessment → yield → financial model → IM chain.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ugCrXw3sMgPWcNFbQ0R3jMZLmoSaioNNGvVf5KrVN7XV_t4ryDcnqKgDFE-QCxYSjuJ4toEg_wWGczL5TOkxC2JR4WutB1_ENeZybY6rN95opBAA6NVLejIFee73mkj4DU2TIxehn_tVM2vjccjVxIrb3a-SoDZxO9aP3UMdJA5XrxHzlWabk2BoR6fo9dN7r0Fx0Pp1bzUfLi6QhFxuGrJQOP6yfsyI9pYMM4NVp_zO7VYR6i5SE7zyVI',
  },
  {
    id: '2f51b060e83f4eb89885c47cc38ecb76',
    title: 'Offtaker Settlement Ledger',
    persona: 'Offtaker',
    route: '/offtaker-suite',
    reads: 'PPA portfolio table · indexation · expected MWh. Reference for the new "PPA portfolio" tab.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ujQcOul0hfb8cjbsmeTiB8erjluA3JH5UX2ZydYAlv_3fnUkN5OWERzRAQJu1o93A772lbia0ETy63FsPzz6HbB2cONsnoe_XwMuG6CDli2oy624P9NuWMVi8CHB9KWDoRL8dgJonFM_9npzU-gKeANMwJA2-W2UvKq1IC35NVQTHdYaj-NnOkxzg8iaUfcuAJS8Uk18PHAZEcABr1yM1nsjfrEJ8Pyfujn3E4jIK3bm-nxtEjj8LFHJUk',
  },
  {
    id: '96667114c247490eb6af770c8b358e59',
    title: 'Offtaker: Load-Shedding Analysis',
    persona: 'Offtaker',
    route: '/offtaker-suite',
    reads: 'Site-level energy balance · TOU buckets · BTM impact. Reference for the new "TOU optimisation" + "BTM design" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ujttWN8gmWbuXsgugp8OYL9N8ncYsDGv6YHHLIlp_4q2AteGkYDvECyym6hWAy4Q42rj8Kf-xmgU5xFW4sWGguY42wpV7pSM_HzbOawuSGjB9E5fiKiPnfvwu97Brnqtj9WNxOuQEBv27xqsd5-ZCz2RGEbC_TwxgfPsqMnmLWLlIE_MMp6v4160kCnUDl3MFsUkA-QamURD3foXCkpTxhMtSTJbTo0XzUYtNN7ySgduWKD7xalIAo8Jg',
  },
  {
    id: '1fafca36b6fb4dd9bdedaa482a586076',
    title: 'ESG Report Generator',
    persona: 'Offtaker',
    route: '/offtaker-suite',
    reads: 'Scope-2 location vs market · RECs retired · CFE match %. Reference for the new "Scope-2 reports" + "CFE commitments" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0ug5n1_JMsxGKJppBE6LqRhnwct8uOl0PtGn45lZAcdOlFgpWWclVBlJPwRmG7c6BGeJ-ldfABxl39-Q08fOngRuJner7rkcwda6B8p3Q7ZShteLsDjV0nvBXR6q_QU8xsPnc4H8WxWMwSAhwqXngW-_9YEHnqObGVfWNoZ1cX6oD1s_haDAGsu_GgI-2Y0lKGyVgHIU2BMuPjh2UWBpjunOyqG0m-RuWk3uAkno-i2MR-fMCAwIgyQy3sE',
  },
  {
    id: '877addbeec284df79b7a4a46f35a2361',
    title: 'Compliance & Audit Archive',
    persona: 'Regulator',
    route: '/regulator-suite',
    reads: 'Inspection register · finding severities · follow-up due dates. Reference for the new "Inspections" + "Compliance monitoring" tabs.',
    thumb: 'https://lh3.googleusercontent.com/aida/ADBb0uic_qGoscucBiFt2Xrwc_jzas43d6AyFjsUcmIh7nQV_SU8PLTI0Ca1FxIEmZ55IKiIitVe2XDv5GqduDroU0yz-mL1j_ZOovMkUGz6MuMRDqb3gg970t_zixbpI4Cawr_h2k0grZFv5IkRQijAUrWIIYnA8JxRJZLmV_h_P-sdOCDHbntRLBXPqgx80j8uKW5Vqt1eZGT05yUQPuk8jrfJkleKJV2beOJWbYdIYvsGlYNRX8HnZFEFeVQ',
  },
];

const PERSONAS: Persona[] = [
  'IPP', 'Offtaker', 'Lender', 'Carbon Fund', 'Grid Operator', 'Regulator', 'Trader',
];

const PERSONA_TINT: Record<Persona, { bg: string; fg: string }> = {
  'IPP':           { bg: '#fef3e6', fg: '#b04e0f' },
  'Offtaker':      { bg: '#ebf7ef', fg: '#0e6027' },
  'Lender':        { bg: '#fef0e0', fg: '#8a4b00' },
  'Carbon Fund':   { bg: '#e7f4ea', fg: '#1a8a5b' },
  'Grid Operator': { bg: '#d4e7f6', fg: '#1a5d97' },
  'Regulator':     { bg: '#f3e6f9', fg: '#5d3a7e' },
  'Trader':        { bg: '#fde7e9', fg: '#a8385c' },
  'Cross-role':    { bg: '#eef1f4', fg: '#3d4756' },
};

export function DesignGallery(): React.JSX.Element {
  const [filter, setFilter] = useState<Persona | 'All'>('All');
  const visible = filter === 'All' ? SCREENS : SCREENS.filter((s) => s.persona === filter);

  return (
    <div className="min-h-screen pb-16" style={{ background: '#f5f8fb' }}>
      <header className="border-b" style={{ background: '#fff', borderColor: '#dde4ec' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-[11px] uppercase tracking-[0.18em] font-mono" style={{ color: '#525a66' }}>
            Design references · Stitch · Consolidated Energy Cockpit
          </p>
          <h1 className="mt-1 text-[32px] font-bold tracking-tight" style={{ color: '#0f1c2e' }}>
            Design Gallery
          </h1>
          <p className="mt-1 text-[14px] max-w-2xl" style={{ color: '#3d4756' }}>
            Hi-fi reference designs from the Stitch &quot;NXT Open Energy Platform&quot; project, paired with the new role
            workbench tabs added in migration 047. Each card shows the design persona, the SPA route it relates to,
            and a thumbnail of the full Stitch mock.
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Filter by persona">
          <FilterChip active={filter === 'All'} label={`All (${SCREENS.length})`} onClick={() => setFilter('All')} />
          {PERSONAS.map((p) => {
            const n = SCREENS.filter((s) => s.persona === p).length;
            if (!n) return null;
            return (
              <FilterChip
                key={p}
                active={filter === p}
                label={`${p} · ${n}`}
                tint={PERSONA_TINT[p]}
                onClick={() => setFilter(p)}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((s) => (
            <article
              key={s.id}
              className="bg-white rounded-lg border overflow-hidden flex flex-col"
              style={{ borderColor: '#dde4ec' }}
            >
              <a
                href={s.thumb}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-50 border-b"
                style={{ borderColor: '#eef2f7', aspectRatio: '16 / 10' }}
              >
                <img
                  src={s.thumb}
                  alt={`${s.title} — Stitch design thumbnail`}
                  loading="lazy"
                  width={640}
                  height={400}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </a>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: PERSONA_TINT[s.persona].bg, color: PERSONA_TINT[s.persona].fg }}
                  >
                    {s.persona}
                  </span>
                  <code className="text-[10px] font-mono" style={{ color: '#525a66' }}>{s.id.slice(0, 8)}…</code>
                </div>
                <h2 className="text-[16px] font-semibold leading-tight" style={{ color: '#0f1c2e' }}>{s.title}</h2>
                <p className="mt-1 text-[12px] leading-snug flex-1" style={{ color: '#525a66' }}>{s.reads}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Link
                    to={s.route}
                    className="text-[12px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-sm"
                    style={{ color: '#1a3a5c' }}
                  >
                    Open route →
                  </Link>
                  <a
                    href={s.thumb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-sm"
                    style={{ color: '#1a3a5c' }}
                  >
                    Full design ↗
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>

        {visible.length === 0 && (
          <div className="text-center py-12 text-[14px]" style={{ color: '#525a66' }}>
            No designs for this persona yet — generate one in Stitch and add it to the gallery.
          </div>
        )}

        <p className="mt-10 text-[12px]" style={{ color: '#525a66' }}>
          Designs live in Stitch project <code className="font-mono">2724118800035624930</code> (&quot;NXT Open Energy Platform&quot;).
          Add more via the Stitch MCP tool <code className="font-mono">generate_screen_from_text</code>.
        </p>
      </div>

      <LtmLogo />
    </div>
  );
}

function FilterChip({
  active, label, onClick, tint,
}: {
  active: boolean; label: string; onClick: () => void;
  tint?: { bg: string; fg: string };
}) {
  const style = active && tint
    ? { background: tint.fg, color: '#fff', borderColor: tint.fg }
    : active
      ? { background: '#1a3a5c', color: '#fff', borderColor: '#1a3a5c' }
      : { background: '#fff', color: '#0f1c2e', borderColor: '#dde4ec' };
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors"
      style={style}
    >
      {label}
    </button>
  );
}

export default DesignGallery;
