"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Html, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MissionBriefing } from "@/lib/mission-types";
import {
  buildFindings,
  bySeverityFirst,
  fallbackSynopsis,
  formatTafWindow,
} from "@/lib/briefing-narrative";
import { formatAdvisoryClock } from "@/lib/aviation-intel";

export type BriefSection = "adverse" | "synopsis" | "weather" | "forecast" | "charts" | "notams";

const CHARTS = [
  {
    id: "surface",
    title: "Surface analysis",
    blurb:
      "WPC surface chart — fronts, highs/lows, and precipitation. Use it to see whether a front or marine layer sits on your corridor.",
  },
  {
    id: "surface36",
    title: "Surface +36h",
    blurb: "WPC outlook ~36 hours out. Check whether arrival weather is improving or deteriorating after your ETA.",
  },
  {
    id: "wind050",
    title: "Winds FL050",
    blurb: "Forecast winds near 5,000 ft. Compare to your cruise altitude for headwind/tailwind and drift.",
  },
  {
    id: "wind100",
    title: "Winds FL100",
    blurb: "Forecast winds near 10,000 ft. Useful if you climb higher or evaluate an alternate altitude.",
  },
  {
    id: "goes",
    title: "GOES Geocolor",
    blurb: "Live satellite — cloud coverage and fog/stratus. FEW/SCT patches are not a ceiling; look for solid BKN/OVC decks.",
  },
  {
    id: "goesir",
    title: "GOES IR",
    blurb: "Infrared satellite highlights cold cloud tops (taller convection). Helpful for spotting buildups along the route.",
  },
  {
    id: "radar",
    title: "CONUS radar",
    blurb: "National radar mosaic. Echoes on your path are a go/no-go cue for VFR — detour or delay if painted.",
  },
] as const;

function skyLine(w: { ceilingAglFt: number | null; cloudDecks: { coverage: string; baseAglFt: number }[] }) {
  const decks = w.cloudDecks.filter((d) => d.coverage !== "SKC");
  if (!decks.length) return "Sky clear — no reported cloud layers.";
  return decks
    .map((d) => {
      const base = `${d.coverage} ${d.baseAglFt.toLocaleString()} ft AGL`;
      if (d.coverage === "BKN" || d.coverage === "OVC") return `${base} (CEILING)`;
      return `${base} (not a ceiling)`;
    })
    .join(" · ");
}

function PortalPlate({
  position,
  title,
  line,
  accent,
  badge,
  w,
  h,
  onOpen,
}: {
  position: [number, number, number];
  title: string;
  line: string;
  accent: string;
  badge?: number;
  w: number;
  h: number;
  onOpen: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [hot, setHot] = useState(false);
  const base = useRef(1);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.quaternion.copy(camera.quaternion);
    const target = hot ? 1.12 : 1;
    base.current += (target - base.current) * Math.min(1, dt * 10);
    group.current.scale.setScalar(base.current);
    group.current.position.y = position[1] + Math.sin(performance.now() * 0.0012 + position[0]) * w * 0.02;
  });

  return (
    <group ref={group} position={position}>
      <RoundedBox
        args={[w, h, w * 0.08]}
        radius={w * 0.04}
        smoothness={4}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHot(false);
          document.body.style.cursor = "auto";
        }}
      >
        <meshStandardMaterial
          color={hot ? "#2a4050" : "#182430"}
          emissive={accent}
          emissiveIntensity={hot ? 0.55 : 0.32}
          roughness={0.3}
          metalness={0.3}
        />
      </RoundedBox>
      <mesh position={[0, 0, w * 0.045]}>
        <planeGeometry args={[w * 0.92, h * 0.92]} />
        <meshBasicMaterial color={accent} transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, -h * 0.65, 0]}>
        <cylinderGeometry args={[w * 0.08, w * 0.14, h * 0.35, 12]} />
        <meshStandardMaterial color="#0f1820" emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      <Html
        center
        position={[0, 0, w * 0.06]}
        distanceFactor={w * 4.2}
        zIndexRange={[100, 0]}
        style={{ pointerEvents: "auto", userSelect: "none" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerOver={() => {
            setHot(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHot(false);
            document.body.style.cursor = "auto";
          }}
          style={{
            width: 220,
            textAlign: "center",
            color: "#f2f7f8",
            fontFamily: "system-ui, sans-serif",
            textShadow: "0 2px 10px rgba(0,0,0,.65)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a9c0c8" }}>
            {title}
            {badge != null && badge > 0 ? (
              <span
                style={{
                  marginLeft: 8,
                  display: "inline-block",
                  minWidth: 18,
                  padding: "0 5px",
                  borderRadius: 99,
                  background: "#c2412d",
                  color: "#fff",
                  fontSize: 11,
                  letterSpacing: 0,
                }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 720, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {line}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, letterSpacing: "0.12em", color: accent }}>ENTER ›</div>
        </button>
      </Html>
    </group>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="brief-modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="brief-paper"
      >
        <div className="brief-paper-head">
          <div>
            <small>AEROTWIN · PILOT BRIEF</small>
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
        <div className="brief-paper-body">{children}</div>
        <footer>PRELIMINARY BRIEF · VERIFY AGAINST OFFICIAL SOURCES BEFORE FLIGHT</footer>
      </div>
    </div>,
    document.body
  );
}

/** 3D portal ring — must stay inside Canvas (no raw DOM siblings). */
export default function FloatingCards({
  briefing,
  span,
  onSection,
}: {
  briefing: MissionBriefing;
  span: number;
  onSection: (s: BriefSection | null) => void;
}) {
  const stamp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const { decision: d, weather } = briefing.corridor;
  const notams = useMemo(() => {
    const findings = buildFindings(d, briefing.weatherIntel);
    return findings
      .filter((f) =>
        ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
      )
      .sort(bySeverityFirst);
  }, [d, briefing.weatherIntel]);

  useFrame(() => {
    if (stamp.current) stamp.current.quaternion.copy(camera.quaternion);
  });

  const tone = d.verdict === "GO" ? "#157a45" : d.verdict === "MARGINAL" ? "#a16207" : "#c2412d";
  const pw = span * 0.14;
  const ph = span * 0.09;
  const ring = span * 0.3;
  const lift = span * 0.08;

  const portals: Array<{
    section: BriefSection;
    title: string;
    line: string;
    accent: string;
    badge?: number;
    angle: number;
  }> = [
    {
      section: "synopsis",
      title: "Route",
      line: `${briefing.corridor.origin.icao} → ${briefing.corridor.destination.icao}`,
      accent: "#8be5df",
      angle: -2.4,
    },
    {
      section: "adverse",
      title: "Adverse",
      line: d.blockers.length ? `${d.blockers.length} hard stops` : "Clear",
      accent: d.blockers.length ? "#ff8f78" : "#7ddec0",
      badge: d.blockers.length || undefined,
      angle: -1.4,
    },
    {
      section: "weather",
      title: "Current wx",
      line: `${weather.origin.flightCategory} / ${weather.destination.flightCategory}`,
      accent: "#9ec5ff",
      angle: -0.45,
    },
    {
      section: "forecast",
      title: "Forecasts",
      line: "TAFs · windows",
      accent: "#f0c36a",
      angle: 0.45,
    },
    {
      section: "charts",
      title: "Charts",
      line: "NOAA graphics",
      accent: "#c9b6ff",
      angle: 1.4,
    },
    {
      section: "notams",
      title: "NOTAMs",
      line: `${notams.length} hazards`,
      accent: "#ffb4a2",
      badge: notams.length || undefined,
      angle: 2.4,
    },
  ];

  return (
    <>
      <group ref={stamp} position={[0, span * 0.18, 0]}>
        <RoundedBox
          args={[span * 0.3, span * 0.1, span * 0.028]}
          radius={span * 0.018}
          onClick={(e) => {
            e.stopPropagation();
            onSection("adverse");
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        >
          <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.55} roughness={0.35} metalness={0.25} />
        </RoundedBox>
        <Html
          center
          position={[0, 0, span * 0.018]}
          distanceFactor={span * 0.55}
          zIndexRange={[120, 0]}
          style={{ pointerEvents: "auto" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSection("adverse");
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              textAlign: "center",
              color: "white",
              fontFamily: "system-ui, sans-serif",
              textShadow: "0 4px 18px rgba(0,0,0,.55)",
              width: 260,
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 8,
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.22em", opacity: 0.9 }}>VFR DECISION</div>
            <div style={{ fontSize: 48, fontWeight: 820, letterSpacing: "0.04em", lineHeight: 1.05 }}>
              {d.verdict.replace("_", "-")}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, opacity: 0.92 }}>
              {d.blockers.length ? `${d.blockers.length} hard stops · click` : "click for detail"}
            </div>
          </button>
        </Html>
      </group>

      {portals.map((p) => (
        <PortalPlate
          key={p.section}
          position={[Math.sin(p.angle) * ring, lift, Math.cos(p.angle) * ring]}
          title={p.title}
          line={p.line}
          accent={p.accent}
          badge={p.badge}
          w={pw}
          h={ph}
          onOpen={() => onSection(p.section)}
        />
      ))}
    </>
  );
}

/** DOM modals — must render OUTSIDE Canvas so R3F never sees HTML tags. */
export function BriefPortalModals({
  briefing,
  section,
  onSection,
}: {
  briefing: MissionBriefing;
  section: BriefSection | null;
  onSection: (s: BriefSection | null) => void;
}) {
  const [chart, setChart] = useState<(typeof CHARTS)[number]["id"]>("surface");
  const [chartError, setChartError] = useState(false);
  const [remoteSynopsis, setRemoteSynopsis] = useState({ key: "", value: "" });
  const { decision: d, weather } = briefing.corridor;
  const intel = briefing.weatherIntel;
  const findings = useMemo(() => buildFindings(d, intel), [d, intel]);
  const adverse = findings
    .filter((f) => f.severity === "stop" || f.severity === "caution")
    .slice()
    .sort(bySeverityFirst);
  const notams = findings
    .filter((f) =>
      ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
    )
    .slice()
    .sort(bySeverityFirst);
  const ruleChecksSorted = useMemo(
    () =>
      [...(d.ruleChecks || [])].sort(
        (a, b) =>
          ({ fail: 0, caution: 1, pass: 2 }[a.result] ?? 3) -
          ({ fail: 0, caution: 1, pass: 2 }[b.result] ?? 3)
      ),
    [d.ruleChecks]
  );
  const corridorProducts = useMemo(
    () =>
      [...(intel?.advisories || [])]
        .filter((a) => a.intersectsRoute)
        .sort(
          (a, b) =>
            ({ severe: 0, caution: 1, info: 2 }[a.severity] ?? 3) -
            ({ severe: 0, caution: 1, info: 2 }[b.severity] ?? 3)
        )
        .slice(0, 8),
    [intel?.advisories]
  );
  const nm = briefing.corridor.terrainProfile.at(-1)?.distanceNm.toFixed(0) || "—";
  const synopsis =
    briefing.aiSynopsis ||
    (remoteSynopsis.key === briefing.generatedAt ? remoteSynopsis.value : "") ||
    fallbackSynopsis(d, findings);
  const activeChart = CHARTS.find((c) => c.id === chart) || CHARTS[0];

  useEffect(() => {
    if (briefing.aiSynopsis) return;
    let cancelled = false;
    void fetch("/api/brief-narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: briefing.corridor.origin.icao,
        destination: briefing.corridor.destination.icao,
        verdict: d.verdict,
        findings: findings.slice(0, 8),
        depCategory: weather.origin.flightCategory,
        arrCategory: weather.destination.flightCategory,
        cruiseFt: briefing.corridor.cruiseAltitudeFt,
        eteMin: d.estimatedTimeEnrouteMin,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.synopsis) {
          setRemoteSynopsis({ key: briefing.generatedAt, value: data.synopsis });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [briefing, d, findings, weather]);

  if (!section) return null;

  return (
    <>
      {section === "synopsis" && (
        <ModalShell title="Synopsis" onClose={() => onSection(null)}>
          <p className="brief-meta">
            {nm} NM · {briefing.corridor.cruiseAltitudeFt.toLocaleString()} ft · {d.estimatedTimeEnrouteMin} min ·{" "}
            {briefing.corridor.aircraft.modelName}
          </p>
          <p className="brief-lead">{synopsis}</p>
          <p className="brief-meta">
            Depart {d.recommendedDepRunway || "—"} · Land {d.recommendedArrRunway || "—"} · Fuel {d.fuelRequiredGal} gal ·
            Terrain {d.minTerrainClearanceFt.toLocaleString()} ft
          </p>
          <p className="brief-note">
            Ceiling for VFR rules means the lowest BKN or OVC layer. FEW/SCT are clouds you must remain clear of, but they are
            not the flight ceiling and alone do not force a NO-GO.
          </p>
        </ModalShell>
      )}

      {section === "adverse" && (
        <ModalShell title="VFR decision · 91.155 checklist" onClose={() => onSection(null)}>
          <div className={`route-brief-verdict ${d.verdict.toLowerCase().replace("_", "-")}`} style={{ marginBottom: 14, display: "inline-block" }}>
            {d.verdict.replace("_", "-")}
          </div>
          <p className="brief-lead" style={{ marginTop: 0 }}>{d.summary}</p>

          {ruleChecksSorted.length > 0 && (
            <div className="rule-check-list">
              {ruleChecksSorted.map((r, idx) => (
                <article key={`${r.id}-${r.result}-${idx}`} className={`rule-check ${r.result}`}>
                  <header>
                    <b>{r.title}</b>
                    <em>{r.regulation}</em>
                    <span>{r.result === "pass" ? "PASS" : r.result === "caution" ? "CAUTION" : "FAIL"}</span>
                  </header>
                  <p className="rule-check-detail">{r.detail}</p>
                </article>
              ))}
            </div>
          )}

          {adverse.length > 0 && (
            <>
              <h3 className="brief-subhead">Why this decision</h3>
              {adverse.map((f) => (
                <div key={f.id} className={`finding-card ${f.severity}`}>
                  <div className="finding-title">
                    {f.title} · {f.source}
                  </div>
                  <div className="finding-body">{f.plain}</div>
                </div>
              ))}
            </>
          )}

          {corridorProducts.length > 0 && (
            <>
              <h3 className="brief-subhead">Corridor products (valid times · altitudes)</h3>
              {corridorProducts.map((a) => (
                <article
                  key={a.id}
                  className={`finding-card ${a.severity === "severe" ? "stop" : a.severity === "caution" ? "caution" : ""}`}
                >
                  <div className="finding-title">
                    {a.product} · {a.hazard}
                  </div>
                  <p className="brief-meta" style={{ marginBottom: 6 }}>
                    {[
                      a.altitudeBase || a.altitudeTop
                        ? `Alt ${a.altitudeBase || "SFC"}–${a.altitudeTop || "UNL"}`
                        : "Alt not specified",
                      a.issuedAt ? `Issued ${formatAdvisoryClock(a.issuedAt)}` : null,
                      a.validFrom ? `Valid ${formatAdvisoryClock(a.validFrom)}` : null,
                      a.validTo ? `Expires ${formatAdvisoryClock(a.validTo)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <code className="route-brief-raw">{a.raw || a.summary}</code>
                </article>
              ))}
            </>
          )}

          {d.regulatoryCitations?.length > 0 && (
            <p className="brief-cite">Citations: {d.regulatoryCitations.join(" · ")}</p>
          )}
        </ModalShell>
      )}

      {section === "weather" && (
        <ModalShell title="Weather · METAR / sky" onClose={() => onSection(null)}>
          <p className="brief-note">
            Official ceiling = lowest BKN or OVC. FEW (1–2/8) and SCT (3–4/8) are reported for cloud clearance, not as a
            ceiling that sets MVFR/IFR by height alone.
          </p>
          {[weather.origin, weather.destination].map((w) => (
            <div key={w.icao} className="wx-block">
              <div className="wx-block-head">
                <strong>
                  {w.icao} · {w.flightCategory}
                </strong>
                <span>{w.source || "wx"}</span>
              </div>
              <div className="route-brief-grid">
                <div>
                  <small>WIND</small>
                  <b>
                    {w.windDirDeg.toString().padStart(3, "0")}° / {w.windSpeedKt} KT
                  </b>
                </div>
                <div>
                  <small>VISIBILITY</small>
                  <b>{w.visibilitySm != null ? `${w.visibilitySm} SM` : "NR"}</b>
                </div>
                <div>
                  <small>CEILING (BKN/OVC)</small>
                  <b>{w.ceilingAglFt != null ? `${w.ceilingAglFt.toLocaleString()} FT AGL` : "NONE"}</b>
                </div>
              </div>
              <p className="brief-meta" style={{ marginTop: 8 }}>
                {skyLine(w)}
              </p>
              <code className="route-brief-raw">{w.rawMetar}</code>
            </div>
          ))}
        </ModalShell>
      )}

      {section === "forecast" && (
        <ModalShell title="Forecasts · TAF along route" onClose={() => onSection(null)}>
          <button type="button" className="brief-jump" onClick={() => onSection("charts")}>
            Open NOAA / NWS charts →
          </button>
          <p className="brief-note">
            TAFs selected for your scheduled departure and ETA, plus enroute stations near the corridor for a wider picture.
          </p>
          {[
            {
              label: "Departure",
              icao: briefing.corridor.origin.icao,
              name: briefing.corridor.origin.name,
              w: intel?.originForecast || weather.origin,
              from: intel?.originPeriodFrom,
              to: intel?.originPeriodTo,
              note: intel?.originForecast.forecastNote,
              tafRaw: intel?.originTaf?.raw,
            },
            ...(intel?.enroute || []).map((e) => ({
              label: "Enroute",
              icao: e.icao,
              name: e.name,
              w: e.weather,
              from: e.periodFrom,
              to: e.periodTo,
              note: e.weather.forecastNote,
              tafRaw: e.taf.raw,
            })),
            {
              label: "Arrival",
              icao: briefing.corridor.destination.icao,
              name: briefing.corridor.destination.name,
              w: intel?.destForecast || weather.destination,
              from: intel?.destPeriodFrom,
              to: intel?.destPeriodTo,
              note: intel?.destForecast.forecastNote,
              tafRaw: intel?.destTaf?.raw,
            },
          ].map((block) => (
            <div key={`${block.label}-${block.icao}`} className="wx-block">
              <div className="wx-block-head">
                <strong>
                  {block.icao} {block.label}
                  {block.name ? ` · ${block.name}` : ""} · {block.w.flightCategory}
                </strong>
                <span>{block.w.source || "obs"}</span>
              </div>
              <p className="brief-meta">
                {block.from && block.to ? formatTafWindow(block.from, block.to) : "Observation only — no TAF window matched"}
              </p>
              <p className="brief-meta">{skyLine(block.w)}</p>
              {block.note && <p className="brief-note">{block.note}</p>}
              <code className="route-brief-raw">{block.tafRaw || block.w.rawMetar}</code>
            </div>
          ))}
        </ModalShell>
      )}

      {section === "charts" && (
        <ModalShell title="Charts · NOAA / NWS" onClose={() => onSection(null)}>
          <div className="chart-picks">
            {CHARTS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={chart === c.id ? "on" : undefined}
                onClick={() => {
                  setChart(c.id);
                  setChartError(false);
                }}
              >
                {c.title}
              </button>
            ))}
          </div>
          <p className="brief-lead" style={{ fontSize: 14 }}>
            {activeChart.blurb}
          </p>
          {chartError ? (
            <div className="chart-error">
              <b>Chart failed to load</b>
              <span>The upstream NOAA/NWS product was unavailable. Try another tab or open aviationweather.gov.</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={chart}
              src={`/api/noaa-chart?id=${chart}`}
              alt={activeChart.title}
              className="chart-frame"
              onError={() => setChartError(true)}
            />
          )}
          <p className="brief-cite">
            Products proxied from WPC, Aviation Weather Center, NESDIS, and NWS Radar. Verify on official sites before flight.
          </p>
        </ModalShell>
      )}

      {section === "notams" && (
        <ModalShell title="Route brief · NOTAMs & hazards" onClose={() => onSection(null)}>
          <div className="route-brief-head">
            <div>
              <small>ROUTE</small>
              <strong>{briefing.corridor.origin.icao} → {briefing.corridor.destination.icao}</strong>
            </div>
            <span className={`route-brief-verdict ${d.verdict.toLowerCase().replace("_", "-")}`}>
              {d.verdict.replace("_", "-")}
            </span>
            <time>{new Date(briefing.generatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
          </div>

          <div className="route-brief-metrics">
            <span><small>DISTANCE</small><b>{nm} NM</b></span>
            <span><small>CRUISE</small><b>{briefing.corridor.cruiseAltitudeFt.toLocaleString()} FT</b></span>
            <span><small>ETE</small><b>{d.estimatedTimeEnrouteMin} MIN</b></span>
            <span><small>FUEL</small><b>{d.fuelRequiredGal} GAL</b></span>
          </div>

          <section className="route-brief-section">
            <div className="route-brief-section-title"><span>01</span><div><b>DEPARTURE</b><small>{briefing.corridor.origin.name}</small></div><em>{weather.origin.flightCategory}</em></div>
            <div className="route-brief-grid">
              <div><small>RUNWAY</small><b>{d.recommendedDepRunway || "REVIEW"}</b></div>
              <div><small>WIND</small><b>{weather.origin.windDirDeg.toString().padStart(3, "0")}° / {weather.origin.windSpeedKt} KT</b></div>
              <div><small>CEILING</small><b>{weather.origin.ceilingAglFt ? `${weather.origin.ceilingAglFt.toLocaleString()} FT` : "CLEAR"}</b></div>
            </div>
            <code className="route-brief-raw">{weather.origin.rawMetar}</code>
          </section>

          <section className="route-brief-section">
            <div className="route-brief-section-title"><span>02</span><div><b>ENROUTE CORRIDOR</b><small>Weather advisories · TFRs · PIREPs · route notices</small></div><em>{notams.length ? `${notams.length} ITEM${notams.length === 1 ? "" : "S"}` : "CLEAR"}</em></div>
            {notams.length === 0 ? (
              <div className="route-brief-empty"><b>✓ No corridor hazards returned</b><span>The automated route scan found no intersecting TFR, SIGMET, G-AIRMET, CWA, or PIREP items.</span></div>
            ) : (
              <div className="route-notam-list">
                {notams.map((f, index) => (
                  <article key={f.id} className={`route-notam ${f.severity}`}>
                    <span className="route-notam-index">{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{f.source}</small><b>{f.title}</b><p>{f.plain}</p></div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="route-brief-section">
            <div className="route-brief-section-title"><span>03</span><div><b>ARRIVAL</b><small>{briefing.corridor.destination.name}</small></div><em>{weather.destination.flightCategory}</em></div>
            <div className="route-brief-grid">
              <div><small>RUNWAY</small><b>{d.recommendedArrRunway || "REVIEW"}</b></div>
              <div><small>WIND</small><b>{weather.destination.windDirDeg.toString().padStart(3, "0")}° / {weather.destination.windSpeedKt} KT</b></div>
              <div><small>CEILING</small><b>{weather.destination.ceilingAglFt ? `${weather.destination.ceilingAglFt.toLocaleString()} FT` : "CLEAR"}</b></div>
            </div>
            <code className="route-brief-raw">{weather.destination.rawMetar}</code>
          </section>

          <p className="route-brief-source">Automated preview from available weather and airspace products. Complete an official NOTAM briefing before flight.</p>
        </ModalShell>
      )}
    </>
  );
}
