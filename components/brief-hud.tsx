"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MissionBriefing } from "@/lib/mission-types";
import { buildFindings, fallbackSynopsis, formatTafWindow } from "@/lib/briefing-narrative";

type Section = "adverse" | "synopsis" | "weather" | "forecast" | "charts" | "notams";

const CHARTS = [
  { id: "sigwx", title: "Significant weather" },
  { id: "wind050", title: "Winds FL050" },
  { id: "wind100", title: "Winds FL100" },
  { id: "surface", title: "Surface" },
  { id: "goes", title: "GOES-West" },
] as const;

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "grid",
        placeItems: "center",
        background: "rgba(6,10,14,0.5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92%)",
          maxHeight: "75%",
          overflow: "auto",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(180deg,#1b2730,#101820)",
          color: "#e8f2f5",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          padding: 20,
          animation: "briefModalPop 0.32s cubic-bezier(.16,1,.3,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <strong style={{ fontSize: 18 }}>{title}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              border: 0,
              borderRadius: 8,
              padding: "8px 12px",
              background: "#e8f2f5",
              color: "#102026",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function BriefHud({ briefing }: { briefing: MissionBriefing }) {
  const [section, setSection] = useState<Section | null>(null);
  const [chart, setChart] = useState<(typeof CHARTS)[number]["id"]>("sigwx");
  const [synopsis, setSynopsis] = useState("");
  const { decision: d, weather } = briefing.corridor;
  const intel = briefing.weatherIntel;
  const findings = useMemo(() => buildFindings(d, intel), [d, intel]);
  const adverse = findings.filter((f) => f.severity === "stop" || f.severity === "caution");
  const notams = findings.filter((f) =>
    ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
  );

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

  const tone = d.verdict === "GO" ? "#157a45" : d.verdict === "MARGINAL" ? "#a16207" : "#c2412d";
  const nm = briefing.corridor.terrainProfile.at(-1)?.distanceNm.toFixed(0) || "—";

  const nav: Array<{ id: Section; label: string; count?: number }> = [
    { id: "adverse", label: "Adverse", count: d.blockers.length || undefined },
    { id: "synopsis", label: "Synopsis" },
    { id: "weather", label: "Current wx" },
    { id: "forecast", label: "Forecasts" },
    { id: "charts", label: "Charts" },
    { id: "notams", label: "NOTAMs", count: notams.length || undefined },
  ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 8,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 18,
          pointerEvents: "auto",
          maxWidth: 340,
        }}
      >
        <div style={{ fontSize: 12, color: "#24343c", marginBottom: 6, fontWeight: 600 }}>
          {briefing.corridor.origin.icao} → {briefing.corridor.destination.icao}
          <span style={{ opacity: 0.65 }}>
            {" "}
            · {nm} NM · {briefing.corridor.cruiseAltitudeFt.toLocaleString()} ft
          </span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "12px 18px",
            borderRadius: 14,
            background: tone,
            color: "white",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "0.03em",
            boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            lineHeight: 1,
          }}
        >
          {d.verdict.replace("_", "-")}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#2c3c45", maxWidth: 300, lineHeight: 1.4 }}>
          {d.blockers.length
            ? `${d.blockers.length} hard stop${d.blockers.length === 1 ? "" : "s"} — open Adverse`
            : "No hard stops on this plan"}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          top: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          pointerEvents: "auto",
          width: 168,
        }}
      >
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(20,30,36,0.12)",
              background: "rgba(255,255,255,0.88)",
              color: "#152028",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
              textAlign: "left",
            }}
          >
            {item.label}
            {item.count != null && item.count > 0 ? (
              <span
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: "#c2412d",
                  color: "white",
                  fontSize: 11,
                  lineHeight: "18px",
                  textAlign: "center",
                  padding: "0 5px",
                }}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {section && (
        <div style={{ pointerEvents: "auto" }}>
          {section === "synopsis" && (
            <Modal title="Synopsis" onClose={() => setSection(null)}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{synopsis}</p>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#9eb2bb" }}>
                Depart {d.recommendedDepRunway || "—"} · Land {d.recommendedArrRunway || "—"} · Fuel{" "}
                {d.fuelRequiredGal} gal
              </p>
            </Modal>
          )}
          {section === "adverse" && (
            <Modal title="Adverse conditions" onClose={() => setSection(null)}>
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
            </Modal>
          )}
          {section === "weather" && (
            <Modal title="Current weather" onClose={() => setSection(null)}>
              {[weather.origin, weather.destination].map((w) => (
                <div key={w.icao} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 650 }}>
                    {w.icao} · {w.flightCategory}
                  </div>
                  <div style={{ fontSize: 13, color: "#c5d5dc", marginTop: 4 }}>
                    Wind {w.windDirDeg.toString().padStart(3, "0")}° at {w.windSpeedKt} kt · Vis{" "}
                    {w.visibilitySm ?? "—"} sm
                  </div>
                  <code style={{ display: "block", marginTop: 6, fontSize: 11, color: "#9eb2bb" }}>
                    {w.rawMetar}
                  </code>
                </div>
              ))}
            </Modal>
          )}
          {section === "forecast" && (
            <Modal title="Forecasts" onClose={() => setSection(null)}>
              <button
                type="button"
                onClick={() => setSection("charts")}
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
                Open NOAA charts
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
                  {block.note && (
                    <div style={{ fontSize: 12, color: "#9eb2bb", marginTop: 4 }}>{block.note}</div>
                  )}
                </div>
              ))}
            </Modal>
          )}
          {section === "charts" && (
            <Modal title="NOAA charts" onClose={() => setSection(null)}>
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
              <img
                src={`/api/noaa-chart?id=${chart}`}
                alt=""
                style={{ width: "100%", borderRadius: 12, display: "block", background: "#eef3f5" }}
              />
            </Modal>
          )}
          {section === "notams" && (
            <Modal title="NOTAMs & hazards" onClose={() => setSection(null)}>
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
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
