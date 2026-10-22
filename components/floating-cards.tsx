"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Html, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MissionBriefing } from "@/lib/mission-types";
import { buildFindings, fallbackSynopsis, formatTafWindow } from "@/lib/briefing-narrative";

export type BriefSection = "adverse" | "synopsis" | "weather" | "forecast" | "charts" | "notams";

const CHARTS = [
  { id: "sigwx", title: "Significant weather" },
  { id: "wind050", title: "Winds FL050" },
  { id: "wind100", title: "Winds FL100" },
  { id: "surface", title: "Surface" },
  { id: "goes", title: "GOES-West" },
] as const;

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
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        background: "rgba(4,8,12,0.62)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 92vw)",
          maxHeight: "80vh",
          overflow: "auto",
          borderRadius: 2,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(165deg,#161d24,#0a0e12)",
          color: "#e8eef2",
          boxShadow: "0 40px 100px rgba(0,0,0,.55)",
          padding: 22,
          fontFamily: "var(--font-barlow), sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span
            style={{
              fontSize: 22,
              letterSpacing: "0.08em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 1,
              padding: "10px 14px",
              background: "#e8eef2",
              color: "#0a0e12",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              cursor: "pointer",
              fontFamily: "var(--font-plex-mono), monospace",
            }}
          >
            CLOSE
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** 3D portal ring — must stay inside Canvas (no raw DOM siblings). */
export default function FloatingCards({
  briefing,
  span,
  section,
  onSection,
}: {
  briefing: MissionBriefing;
  span: number;
  section: BriefSection | null;
  onSection: (s: BriefSection | null) => void;
}) {
  const stamp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const { decision: d, weather } = briefing.corridor;
  const notams = useMemo(() => {
    const findings = buildFindings(d, briefing.weatherIntel);
    return findings.filter((f) =>
      ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
    );
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
  const [chart, setChart] = useState<(typeof CHARTS)[number]["id"]>("sigwx");
  const [synopsis, setSynopsis] = useState("");
  const { decision: d, weather } = briefing.corridor;
  const intel = briefing.weatherIntel;
  const findings = useMemo(() => buildFindings(d, intel), [d, intel]);
  const adverse = findings.filter((f) => f.severity === "stop" || f.severity === "caution");
  const notams = findings.filter((f) =>
    ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
  );
  const nm = briefing.corridor.terrainProfile.at(-1)?.distanceNm.toFixed(0) || "—";

  useEffect(() => {
    setSynopsis(briefing.aiSynopsis || fallbackSynopsis(d, findings));
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
        if (!cancelled && data?.synopsis) setSynopsis(data.synopsis);
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
          <div style={{ fontSize: 13, color: "#9eb2bb", marginBottom: 10 }}>
            {nm} NM · {briefing.corridor.cruiseAltitudeFt.toLocaleString()} ft · {d.estimatedTimeEnrouteMin} min ·{" "}
            {briefing.corridor.aircraft.modelName}
          </div>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{synopsis}</p>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "#c5d5dc" }}>
            Depart {d.recommendedDepRunway || "—"} · Land {d.recommendedArrRunway || "—"} · Fuel {d.fuelRequiredGal} gal ·
            Terrain {d.minTerrainClearanceFt.toLocaleString()} ft
          </p>
        </ModalShell>
      )}

      {section === "adverse" && (
        <ModalShell title="Adverse conditions" onClose={() => onSection(null)}>
          {adverse.length === 0 && <p style={{ color: "#9eb2bb" }}>No adverse items.</p>}
          {adverse.map((f) => (
            <div
              key={f.id}
              style={{
                marginBottom: 8,
                padding: 12,
                borderRadius: 12,
                background: f.severity === "stop" ? "rgba(90,28,22,.55)" : "rgba(70,52,18,.4)",
                border: `1px solid ${f.severity === "stop" ? "rgba(255,140,110,.4)" : "rgba(244,202,126,.35)"}`,
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>
                {f.title} · {f.source}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{f.plain}</div>
            </div>
          ))}
        </ModalShell>
      )}

      {section === "weather" && (
        <ModalShell title="Current weather" onClose={() => onSection(null)}>
          {[weather.origin, weather.destination].map((w) => (
            <div key={w.icao} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 650 }}>
                {w.icao} · {w.flightCategory}
              </div>
              <div style={{ fontSize: 13, color: "#c5d5dc", marginTop: 4 }}>
                Wind {w.windDirDeg.toString().padStart(3, "0")}° at {w.windSpeedKt} kt · Vis {w.visibilitySm ?? "—"} sm
              </div>
              <code style={{ display: "block", marginTop: 6, fontSize: 11, color: "#9eb2bb" }}>{w.rawMetar}</code>
            </div>
          ))}
        </ModalShell>
      )}

      {section === "forecast" && (
        <ModalShell title="Forecasts" onClose={() => onSection(null)}>
          <button
            type="button"
            onClick={() => onSection("charts")}
            style={{
              marginBottom: 12,
              border: "1px solid rgba(255,255,255,.2)",
              background: "rgba(255,255,255,.06)",
              color: "#e8f2f5",
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
            }}
          >
            Jump to NOAA charts
          </button>
          {[
            {
              label: "Departure",
              icao: briefing.corridor.origin.icao,
              w: intel?.originForecast || weather.origin,
              from: intel?.originPeriodFrom,
              to: intel?.originPeriodTo,
              note: intel?.originForecast.forecastNote,
            },
            {
              label: "Arrival",
              icao: briefing.corridor.destination.icao,
              w: intel?.destForecast || weather.destination,
              from: intel?.destPeriodFrom,
              to: intel?.destPeriodTo,
              note: intel?.destForecast.forecastNote,
            },
          ].map((block) => (
            <div key={block.label} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 650 }}>
                {block.icao} {block.label} · {block.w.flightCategory}
              </div>
              <div style={{ fontSize: 13, color: "#c5d5dc", marginTop: 4 }}>
                {block.from && block.to ? formatTafWindow(block.from, block.to) : "Observation only"}
              </div>
              {block.note && <div style={{ fontSize: 12, color: "#9eb2bb", marginTop: 4 }}>{block.note}</div>}
            </div>
          ))}
        </ModalShell>
      )}

      {section === "charts" && (
        <ModalShell title="NOAA charts" onClose={() => onSection(null)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {CHARTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChart(c.id)}
                style={{
                  border: "1px solid rgba(255,255,255,.2)",
                  background: chart === c.id ? "#e8f2f5" : "rgba(255,255,255,.06)",
                  color: chart === c.id ? "#102026" : "#e8f2f5",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                {c.title}
              </button>
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/noaa-chart?id=${chart}`}
            alt=""
            style={{ width: "100%", borderRadius: 12, display: "block", background: "#eef3f5" }}
          />
        </ModalShell>
      )}

      {section === "notams" && (
        <ModalShell title="NOTAMs & hazards" onClose={() => onSection(null)}>
          {notams.length === 0 && <p style={{ color: "#9eb2bb" }}>No corridor hazards in this pull.</p>}
          {notams.map((f) => (
            <div
              key={f.id}
              style={{
                marginBottom: 8,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)",
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: 4 }}>
                {f.title} · {f.source}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{f.plain}</div>
            </div>
          ))}
        </ModalShell>
      )}
    </>
  );
}
