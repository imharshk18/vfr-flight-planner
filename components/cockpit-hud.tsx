"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { MissionBriefing } from "@/lib/mission-types";
import { buildFindings } from "@/lib/briefing-narrative";
import {
  BriefPortalModals,
  type BriefSection,
} from "@/components/floating-cards";

type GaugeTone = "danger" | "warn" | "info" | "ok" | "neutral";

function Dial({
  label,
  tone,
  ring,
  onClick,
  children,
  delay = 0,
  slot,
}: {
  label: string;
  tone: GaugeTone;
  ring: number;
  onClick: () => void;
  children: ReactNode;
  delay?: number;
  slot: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0.12, Math.min(1, ring)) * c;

  return (
    <button
      type="button"
      className={`ck-dial ck-${tone} ck-slot-${slot}`}
      onClick={onClick}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <span className="ck-dial-glass" aria-hidden />
      <svg className="ck-dial-svg" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} className="ck-dial-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="ck-dial-arc"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="ck-dial-face">
        <span className="ck-dial-label">{label}</span>
        <div className="ck-dial-copy">{children}</div>
      </div>
    </button>
  );
}

export default function CockpitHud({
  briefing,
  onVisualize,
  onEdit,
}: {
  briefing: MissionBriefing;
  onVisualize: () => void;
  onEdit: () => void;
}) {
  const [section, setSection] = useState<BriefSection | null>(null);
  const [ready, setReady] = useState(false);
  const { decision: d, weather, aircraft, wb, origin, destination, cruiseAltitudeFt } =
    briefing.corridor;

  const findings = useMemo(() => buildFindings(d, briefing.weatherIntel), [d, briefing.weatherIntel]);
  const notamCount = findings.filter((f) =>
    ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
  ).length;

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const statusTone: GaugeTone =
    d.verdict === "GO" ? "ok" : d.verdict === "MARGINAL" ? "warn" : "danger";
  const statusLine = d.blockers[0] || d.cautions[0] || d.summary;
  const hdg = useMemo(() => {
    const y =
      Math.sin(((destination.lon - origin.lon) * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180);
    const x =
      Math.cos((origin.lat * Math.PI) / 180) * Math.sin((destination.lat * Math.PI) / 180) -
      Math.sin((origin.lat * Math.PI) / 180) *
        Math.cos((destination.lat * Math.PI) / 180) *
        Math.cos(((destination.lon - origin.lon) * Math.PI) / 180);
    return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
      .toString()
      .padStart(3, "0");
  }, [origin, destination]);

  return (
    <>
      <div className={`ck-shell${ready ? " is-on" : ""}`} data-verdict={d.verdict}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ck-frame" src="/cockpit/cessna-frame.png" alt="" draggable={false} />

        <header className="ck-strip">
          <button type="button" className="ck-box" onClick={onEdit}>
            <em>DEP</em>
            <strong>{origin.icao}</strong>
          </button>
          <span className="ck-to">→</span>
          <button type="button" className="ck-box" onClick={onEdit}>
            <em>ARR</em>
            <strong>{destination.icao}</strong>
          </button>
          <div className="ck-rule" />
          <div className="ck-box static">
            <em>ROUTE</em>
            <strong>{briefing.intake.routeMode === "pilotage" ? "PILOTAGE" : "DIRECT"}</strong>
          </div>
          <div className="ck-rule" />
          <div className="ck-altbox">
            <em>CRUISE ALT</em>
            <div className="ck-slider">
              <span>1.5k</span>
              <i
                style={{
                  left: `${Math.min(90, Math.max(8, ((cruiseAltitudeFt - 1500) / 12000) * 100))}%`,
                }}
              />
              <span>13.5k</span>
              <b>{cruiseAltitudeFt.toLocaleString()} FT</b>
            </div>
          </div>
          <div className="ck-end">
            <strong>{aircraft.modelName}</strong>
            <span>
              {d.groundSpeedKt} KT · {d.estimatedTimeEnrouteMin} MIN
            </span>
          </div>
        </header>

        <button type="button" className="ck-fly" onClick={onVisualize}>
          VISUALIZE FLIGHT
        </button>

        <aside className="ck-avionics" aria-hidden>
          <div>
            <em>COM 1</em>
            <b>118.300</b>
          </div>
          <div>
            <em>NAV 1</em>
            <b>114.10</b>
          </div>
          <div>
            <em>XPDR</em>
            <b>1200</b>
          </div>
          <div>
            <em>HDG</em>
            <b>{hdg}°</b>
          </div>
        </aside>

        <div className="ck-panel">
          <Dial
            slot="a1"
            label="NOTAMS"
            tone={notamCount ? "warn" : "ok"}
            ring={notamCount ? Math.min(1, notamCount / 6) : 0.18}
            onClick={() => setSection("notams")}
            delay={40}
          >
            <b>{notamCount}</b>
            <small>{notamCount ? "Active hazards" : "Clear"}</small>
          </Dial>

          <Dial
            slot="a2"
            label="STATUS"
            tone={statusTone}
            ring={d.verdict === "GO" ? 0.22 : d.verdict === "MARGINAL" ? 0.55 : 0.94}
            onClick={() => setSection("adverse")}
            delay={80}
          >
            <b className="ck-big">{d.verdict.replace("_", "-")}</b>
            <small>{statusLine}</small>
          </Dial>

          <Dial
            slot="a3"
            label="FORECASTS"
            tone="info"
            ring={0.62}
            onClick={() => setSection("forecast")}
            delay={120}
          >
            <b>
              {weather.origin.flightCategory}
              <i>/</i>
              {weather.destination.flightCategory}
            </b>
            <small>TAF windows</small>
          </Dial>

          <Dial
            slot="a4"
            label="WEATHER"
            tone={
              [weather.origin.flightCategory, weather.destination.flightCategory].includes("IFR")
                ? "danger"
                : [weather.origin.flightCategory, weather.destination.flightCategory].includes(
                      "MVFR"
                    )
                  ? "warn"
                  : "ok"
            }
            ring={0.48}
            onClick={() => setSection("weather")}
            delay={160}
          >
            <b>
              {weather.origin.windSpeedKt}
              <i>KT</i>
            </b>
            <small>
              Wind {weather.origin.windDirDeg.toString().padStart(3, "0")}° · Vis{" "}
              {weather.origin.visibilitySm ?? "—"}
            </small>
          </Dial>

          <Dial
            slot="b1"
            label="PERF"
            tone="neutral"
            ring={Math.min(1, d.fuelRequiredGal / Math.max(1, wb.fuelGallons))}
            onClick={() => setSection("synopsis")}
            delay={200}
          >
            <b>
              {d.fuelRequiredGal}
              <i>GAL</i>
            </b>
            <small>{d.calculatedClimbRateFpm} fpm</small>
          </Dial>

          <Dial
            slot="b2"
            label="WEIGHT"
            tone={d.weightStatus === "OVERWEIGHT" ? "danger" : "ok"}
            ring={Math.min(1, d.totalRampWeightLbs / aircraft.maxGrossWeightLbs)}
            onClick={() => setSection("synopsis")}
            delay={240}
          >
            <b>
              {d.totalRampWeightLbs.toLocaleString()}
              <i>LB</i>
            </b>
            <small>
              {d.weightStatus} · {aircraft.maxGrossWeightLbs.toLocaleString()}
            </small>
          </Dial>

          <Dial
            slot="b3"
            label="CHARTS"
            tone="info"
            ring={0.4}
            onClick={() => setSection("charts")}
            delay={280}
          >
            <b>NOAA</b>
            <small>SigWx · Winds</small>
          </Dial>
        </div>
      </div>

      <BriefPortalModals briefing={briefing} section={section} onSection={setSection} />
    </>
  );
}
