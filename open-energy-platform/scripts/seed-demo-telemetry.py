#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════════════════
# Synthetic O&M demo-data generator for the esums ML / insight surfaces.
#
# Emits SQL files that seed, under the esco O&M user, two DEMO solar sites with
# ~5 years of hourly (daylight) telemetry carrying injected anomaly episodes,
# plus the DERIVED tables the ML surfaces actually read: om_faults (issues the
# "insights machine" identified), om_predictions (ML prognostics),
# om_forecasts, om_alerts.
#
#   Huawei  — 2021-06-01 → today          (history: "issues identified over years")
#   Sungrow — 2027-07-01 → +5y (literal, future-dated per user)
#
# Everything is fully removable: every row FKs to a site_id like
# 'omsite_demo_%', and ids are 'demo_'-tagged. Site name carries "(DEMO)".
#
# Usage:  python3 scripts/seed-demo-telemetry.py <OWNER_PARTICIPANT_ID> <OUTDIR> <TODAY_ISO>
#   TODAY_ISO e.g. 2026-07-09 (no clock access in the generator — passed in)
# ════════════════════════════════════════════════════════════════════════════
import sys, os, math, random
from datetime import date, timedelta

OWNER   = sys.argv[1]
OUTDIR  = sys.argv[2]
TODAY   = date.fromisoformat(sys.argv[3])
os.makedirs(OUTDIR, exist_ok=True)

def q(s):  # sql string literal
    return "'" + str(s).replace("'", "''") + "'" if s is not None else "NULL"
def n(x):  # sql number / NULL
    return "NULL" if x is None else (str(int(x)) if isinstance(x, int) else f"{x:.3f}")

# ── site definitions ────────────────────────────────────────────────────────
SITES = [
    dict(sid="omsite_demo_hw", key="hw", name="Karoo Solar One (DEMO)",
         mfr="Huawei", model="SUN2000-215KTL", kwp=5200.0, mw=4.5,
         prov="Northern Cape", lat=-28.74, lon=24.76, tariff=1180.0,
         start=date(2021, 6, 1), end=TODAY, seed=71),
    dict(sid="omsite_demo_sg", key="sg", name="Highveld Solar Two (DEMO)",
         mfr="Sungrow", model="SG350HX", kwp=3400.0, mw=3.0,
         prov="Mpumalanga", lat=-26.20, lon=29.45, tariff=1240.0,
         start=date(2027, 7, 1), end=date(2032, 7, 9), seed=93),
]

# SA southern-hemisphere seasonal amplitude + rough sunrise/sunset (SAST hours)
def season(month):
    # peak Dec/Jan, trough Jun/Jul
    amp  = 0.80 + 0.20 * math.cos(2 * math.pi * (month - 1) / 12)   # 0.60..1.00
    half = 5.6 + 1.1 * math.cos(2 * math.pi * (month - 1) / 12)     # daylight half-width h
    return amp, half

def daytemp(month, h, irr_frac):
    base = 16 + 8 * math.cos(2 * math.pi * (month - 1) / 12)        # ambient season
    return base + 3 * math.sin(math.pi * min(max((h - 6) / 12, 0), 1)) + 14 * irr_frac

# ── anomaly episodes: (start_offset_days_from_commission, kind, duration_days) ──
# Recurring across the life so the "insights" story spans years.
def episodes(life_days, rnd):
    ep = []
    y = 0
    while y * 365 < life_days:
        base = y * 365
        # dry-season soiling drift (~9-week slow decay then clean)
        ep.append((base + 210 + rnd.randint(-20, 20), "soiling", 21))
        # one string isolation fault / year
        ep.append((base + 120 + rnd.randint(-30, 30), "string", 5))
        # summer inverter thermal derate
        ep.append((base + 20 + rnd.randint(-10, 10), "derate", 9))
        # comms/offline outage / year
        ep.append((base + 300 + rnd.randint(-40, 40), "offline", 2))
        y += 1
    return [e for e in ep if 0 <= e[0] < life_days]

def anomaly_factor(day_idx, hour, eps):
    """returns (mult, status, quality, note) for a given day/hour."""
    for (off, kind, dur) in eps:
        if off <= day_idx < off + dur:
            t = (day_idx - off) / dur
            if kind == "soiling":
                # linear decay to 0.80 across window (cleaning at end)
                return (1.0 - 0.20 * t, "OK", "valid", None)
            if kind == "string":
                return (0.91, "STR-ISO-LOW", "suspect", None)   # ~1 of 11 strings down
            if kind == "derate" and 10 <= hour <= 15:
                return (0.72, "DERATE-TEMP", "valid", None)       # midday thermal clip
            if kind == "offline":
                return (0.0, "COMM-LOSS", "gap", None)
    return (1.0, "OK", "valid", None)

# ── telemetry generation ────────────────────────────────────────────────────
def gen_site(s, tfiles, meta_stmts):
    rnd = random.Random(s["seed"])
    life_days = (s["end"] - s["start"]).days
    eps = episodes(life_days, rnd)
    kwp = s["kwp"]
    dev_meter = f"omdev_demo_{s['key']}_meter"

    # rows buffered, flushed to numbered files (4000 rows/file)
    rows, fidx = [], [0]
    def flush(force=False):
        if not rows or (len(rows) < 4000 and not force):
            return
        cols = ("id,device_id,site_id,ts,ac_kw,dc_kw,yield_kwh,interval_kwh,"
                "voltage_v,current_a,frequency_hz,temperature_c,irradiance_w_m2,"
                "status_code,quality")
        path = os.path.join(OUTDIR, f"tele_{s['key']}_{fidx[0]:03d}.sql")
        with open(path, "w") as fh:
            fh.write("PRAGMA foreign_keys=OFF;\n")
            for i in range(0, len(rows), 200):
                chunk = rows[i:i+200]
                fh.write(f"INSERT INTO om_telemetry ({cols}) VALUES\n")
                fh.write(",\n".join(chunk) + ";\n")
        tfiles.append(path)
        fidx[0] += 1
        rows.clear()

    degr_per_day = 0.005 / 365.0
    d = s["start"]
    day_idx = 0
    while d <= s["end"]:
        amp, half = season(d.month)
        sunrise = 12.0 - half
        sunset  = 12.0 + half
        cloud   = rnd.uniform(0.30, 1.0) if rnd.random() < 0.28 else rnd.uniform(0.85, 1.0)
        degr    = 1.0 - degr_per_day * day_idx
        yield_cum = 0.0
        h = int(math.floor(sunrise))
        while h <= int(math.ceil(sunset)):
            clear = math.sin(math.pi * (h + 0.5 - sunrise) / (sunset - sunrise))
            if clear <= 0.02:
                h += 1
                continue
            amult, status, quality, _ = anomaly_factor(day_idx, h, eps)
            irr_frac = max(0.0, clear * cloud * amult)
            interval = kwp * clear * 0.82 * amp * cloud * degr * amult
            interval = max(0.0, interval + rnd.uniform(-0.01, 0.01) * kwp * clear)
            yield_cum += interval
            ac = interval
            dc = interval / 0.985 if interval > 0 else 0.0
            volt = 0.0 if interval == 0 else rnd.uniform(770, 830)
            curr = 0.0 if interval == 0 else ac * 1000.0 / 400.0
            freq = 0.0 if interval == 0 else rnd.uniform(49.92, 50.06)
            temp = daytemp(d.month, h, irr_frac)
            irr  = 1000.0 * irr_frac
            ts = f"{d.isoformat()}T{h:02d}:00:00"
            rid = f"omt_demo_{s['key']}_{day_idx}_{h}"
            rows.append("(" + ",".join([
                q(rid), q(dev_meter), q(s["sid"]), q(ts),
                n(ac), n(dc), n(yield_cum), n(interval),
                n(volt), n(curr), n(freq), n(temp), n(irr),
                q(status), q(quality)]) + ")")
            h += 1
        flush()
        d += timedelta(days=1)
        day_idx += 1
    flush(force=True)

    # ── derived rows (faults / predictions / forecasts / alerts) ────────────
    build_meta(s, eps, meta_stmts)

def isod(base, off_days, hh=6):
    return (base + timedelta(days=off_days)).isoformat() + f"T{hh:02d}:15:00"

def build_meta(s, eps, out):
    key, sid = s["key"], s["sid"]
    tariff = s["tariff"]
    inv = [f"omdev_demo_{key}_inv{i}" for i in (1, 2, 3)]
    life_days = (s["end"] - s["start"]).days
    is_future = s["start"] > TODAY
    # anchor "recent" open items near end-of-series (or near TODAY if in range)
    recent_anchor = min(s["end"], TODAY) if not is_future else s["end"]

    # site
    out.append(
        f"INSERT OR REPLACE INTO om_sites "
        f"(id,name,participant_id,technology,capacity_mw,capacity_kwp,province,"
        f"latitude,longitude,commissioning_date,ppa_tariff_zar_mwh,status,om_contractor_id) "
        f"VALUES ({q(sid)},{q(s['name'])},{q(OWNER)},'solar',{n(s['mw'])},{n(s['kwp'])},"
        f"{q(s['prov'])},{n(s['lat'])},{n(s['lon'])},{q(s['start'].isoformat())},"
        f"{n(tariff)},'operational',{q(OWNER)});")
    # devices: 1 telemetry meter + 3 inverters (fault/prediction targets)
    out.append(
        f"INSERT OR REPLACE INTO om_devices (id,site_id,device_type,manufacturer,model,"
        f"serial_number,rated_kw,status,location_in_plant) VALUES "
        f"({q('omdev_demo_'+key+'_meter')},{q(sid)},'meter',{q(s['mfr'])},'Revenue Meter',"
        f"{q('DEMO-'+key.upper()+'-MTR')},{n(s['mw']*1000)},'online','Point of Connection');")
    for i, dv in enumerate(inv, 1):
        out.append(
            f"INSERT OR REPLACE INTO om_devices (id,site_id,device_type,manufacturer,model,"
            f"serial_number,rated_kw,status,location_in_plant) VALUES "
            f"({q(dv)},{q(sid)},'inverter',{q(s['mfr'])},{q(s['model'])},"
            f"{q('DEMO-'+key.upper()+'-INV%d'%i)},{n(s['kwp']/3)},'online',{q('Block %d'%i)});")

    fi = pi = ai = 0
    def fid(): nonlocal fi; fi += 1; return f"omf_demo_{key}_{fi:03d}"
    def pid(): nonlocal pi; pi += 1; return f"omp_demo_{key}_{pi:03d}"
    def aid(): nonlocal ai; ai += 1; return f"oma_demo_{key}_{ai:03d}"

    def add_fault(det_off, dev, cat, sev, code, desc, hourly, dur_days,
                  resolved=True, root=None, wcorr=0):
        det = s["start"] + timedelta(days=det_off)
        total = hourly * 8 * dur_days
        status = "resolved" if resolved else "open"
        res = f"{q((det+timedelta(days=dur_days)).isoformat())}" if resolved else "NULL"
        out.append(
            f"INSERT OR REPLACE INTO om_faults (id,site_id,device_id,category,severity,"
            f"fault_code,description,detected_at,resolved_at,status,root_cause,"
            f"hourly_loss_zar,total_loss_zar,projected_loss_zar,warranty_covered,"
            f"weather_correlated) VALUES ({q(fid())},{q(sid)},{q(dev)},{q(cat)},{q(sev)},"
            f"{q(code)},{q(desc)},{q(det.isoformat())},{res},{q(status)},{q(root)},"
            f"{n(hourly)},{n(total)},{n(hourly*10)},1,{n(wcorr)});")

    def add_pred(gen_off, dev, ptype, conf, fail_off, action, loss, status="open"):
        gen = s["start"] + timedelta(days=gen_off)
        fail = s["start"] + timedelta(days=fail_off)
        closed = "NULL" if status == "open" else q((gen+timedelta(days=14)).isoformat())
        out.append(
            f"INSERT OR REPLACE INTO om_predictions (id,site_id,device_id,prediction_type,"
            f"confidence,estimated_failure_at,recommended_action,estimated_loss_zar,status,"
            f"generated_at,closed_at) VALUES ({q(pid())},{q(sid)},{q(dev)},{q(ptype)},"
            f"{n(conf)},{q(fail.isoformat())},{q(action)},{n(loss)},{q(status)},"
            f"{q(gen.isoformat())},{closed});")

    def add_alert(off, dev, cat, sev, title, body):
        cr = (s["start"] + timedelta(days=off)).isoformat()
        out.append(
            f"INSERT OR REPLACE INTO om_alerts (id,rule_id,site_id,device_id,category,severity,"
            f"title,body,channels,created_at) VALUES ({q(aid())},NULL,{q(sid)},{q(dev)},"
            f"{q(cat)},{q(sev)},{q(title)},{q(body)},'[\"push\",\"email\"]',{q(cr)});")

    # historical faults/predictions from every episode → the "identified over years" story
    for (off, kind, dur) in eps:
        dev = inv[off % 3]
        if kind == "soiling":
            add_pred(off - 12, None, "soiling_accumulation", 0.88, off + dur,
                     "Schedule module wash — soiling ratio trending below 0.85.",
                     round(s["mw"] * 4200), status="confirmed_true")
            add_fault(off + 4, None, "panel", "minor", "SOIL-DRIFT",
                      "Soiling-driven underperformance detected; PR drift vs clear-sky model.",
                      round(s["mw"] * 55), dur, resolved=True,
                      root="Dust accumulation (dry season).", wcorr=1)
        elif kind == "string":
            add_fault(off, dev, "string", "major", "STR-ISO-LOW",
                      "String isolation resistance low — one string offline.",
                      round(s["mw"] * 120), dur, resolved=True,
                      root="Connector water ingress; string reconnected.")
        elif kind == "derate":
            add_fault(off, dev, "inverter", "minor", "DERATE-TEMP",
                      "Inverter thermal derating at midday — output clipped.",
                      round(s["mw"] * 80), dur, resolved=True,
                      root="Cooling fan fouling; cleaned.", wcorr=1)
            add_pred(off - 6, dev, "inverter_failure", 0.74, off + 40,
                     "Inspect cooling fans; thermal signature abnormal.",
                     round(s["mw"] * 9000), status="confirmed_true")
        elif kind == "offline":
            add_fault(off, None, "communication", "critical", "COMM-LOSS",
                      "Datalogger communication lost — full-site telemetry gap.",
                      round(s["mw"] * 260), dur, resolved=True,
                      root="4G modem reboot; comms restored.")
            add_alert(off, None, "fault", "critical",
                      "Site telemetry offline",
                      "No data received for >2h. Auto-dispatch to field team.")

    # ── a few OPEN, RECENT items so the live bleed / prediction surfaces populate ──
    ra_off = (recent_anchor - s["start"]).days
    add_fault(ra_off - 3, inv[0], "string", "major", "STR-ISO-LOW",
              "Active: string isolation fault under investigation.",
              round(s["mw"] * 120), 6, resolved=False,
              root=None)
    add_fault(ra_off - 1, None, "panel", "minor", "SOIL-DRIFT",
              "Active: soiling underperformance; wash scheduled.",
              round(s["mw"] * 55), 10, resolved=False, wcorr=1)
    add_pred(ra_off - 8, inv[1], "panel_hotspot", 0.79, ra_off + 60,
             "Thermographic scan recommended — hotspot signature on Block 2.",
             round(s["mw"] * 6500), status="open")
    add_pred(ra_off - 5, inv[2], "string_degradation", 0.82, ra_off + 90,
             "String Block 3 degrading ~2x fleet median; plan replacement.",
             round(s["mw"] * 7200), status="open")
    add_alert(ra_off - 1, inv[0], "predictive", "major",
              "ML: elevated failure risk on INV Block 1",
              "Model confidence 0.82. Recommended action logged.")

    # ── recent forecasts (day_ahead + week_ahead) so /forecast renders ──
    gen_ts = recent_anchor.isoformat() + "T00:15:00"
    daily_mwh = s["mw"] * 5.4   # ~5.4 peak-sun-hours
    for hz, fdays in (("day_ahead", 1), ("week_ahead", 7)):
        for k in range(1, fdays + 1):
            p50 = daily_mwh * random.Random(s["seed"] + k).uniform(0.85, 1.05)
            out.append(
                f"INSERT OR REPLACE INTO om_forecasts (id,site_id,horizon,forecast_for_ts,"
                f"generated_at,mwh_p50,mwh_p10,mwh_p90,revenue_p50_zar,model_version,"
                f"confidence_pct) VALUES ({q('omfc_demo_'+key+'_'+hz+'_%d'%k)},{q(sid)},"
                f"{q(hz)},{q((recent_anchor+timedelta(days=k)).isoformat()+'T12:00:00')},"
                f"{q(gen_ts)},{n(p50)},{n(p50*0.82)},{n(p50*1.12)},{n(p50*tariff)},"
                f"'demo-synthetic-v1',{n(88.0)});")

# ── run ─────────────────────────────────────────────────────────────────────
tele_files, meta = [], []
# meta first so FK targets (sites/devices) exist before telemetry files load
for s in SITES:
    gen_site(s, tele_files, meta)

meta_path = os.path.join(OUTDIR, "meta_00.sql")
with open(meta_path, "w") as fh:
    fh.write("PRAGMA foreign_keys=OFF;\n" + "\n".join(meta) + "\n")

with open(os.path.join(OUTDIR, "APPLY_ORDER.txt"), "w") as fh:
    fh.write(meta_path + "\n")
    for p in tele_files:
        fh.write(p + "\n")

print(f"meta stmts : {len(meta)}")
print(f"tele files : {len(tele_files)}")
print(f"outdir     : {OUTDIR}")
