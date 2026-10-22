"use client";

import { useEffect, useMemo, useState } from "react";
import type { MissionBriefing } from "@/lib/mission-types";
import {
  buildFindings,
  fallbackSynopsis,
  formatTafWindow,
} from "@/lib/briefing-narrative";

type Section = "stops" | "forecast" | "charts" | "hazards";

const NOAA_CHARTS = [
  { id: "sigwx", title: "Significant weather", note: "Low-level IFR / turbulence / icing" },
  { id: "wind050", title: "Winds FL050", note: "Americas · +6h" },
  { id: "wind100", title: "Winds FL100", note: "Americas · +12h" },
  { id: "surface", title: "Surface forecast", note: "NWS Weather Prediction Center" },
  { id: "goes", title: "GOES-West", note: "Live satellite" },
] as const;

export default function BriefingPanel({ briefing }: { briefing: MissionBriefing }) {
  const [section, setSection] = useState<Section | null>(null);
  const [chartId, setChartId] = useState<(typeof NOAA_CHARTS)[number]["id"]>("sigwx");
  const [synopsis, setSynopsis] = useState("");
  const [entered, setEntered] = useState(false);

  const { decision: d, weather } = briefing.corridor;
  const intel = briefing.weatherIntel;
  const findings = useMemo(() => buildFindings(d, intel), [d, intel]);
  const stops = findings.filter((f) => f.severity === "stop" || f.severity === "caution");
  const hazards = findings.filter((f) =>
    ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const local = briefing.aiSynopsis || fallbackSynopsis(d, findings);
    setSynopsis(local);
    if (briefing.aiSynopsis) return;
    let cancelled = false;
    void fetch("/api/brief-narrative", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: briefing.corridor.origin.icao,
        destination: briefing.corridor.destination.icao,
        verdict: d.verdict,
        findings: findings.slice(0, 10),
        depCategory: weather.origin.flightCategory,
        arrCategory: weather.destination.flightCategory,
        cruiseFt: briefing.corridor.cruiseAltitudeFt,
        eteMin: d.estimatedTimeEnrouteMin,
        depLocal: briefing.intake.departureLocal,
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

  const tone =
    d.verdict === "GO" ? "go" : d.verdict === "MARGINAL" ? "marginal" : "nogo";
  const nm = briefing.corridor.terrainProfile.at(-1)?.distanceNm.toFixed(1) || "—";
  const chart = NOAA_CHARTS.find((c) => c.id === chartId) || NOAA_CHARTS[0];
  const depSec = new Date(briefing.intake.departureLocal || Date.now()).getTime() / 1000;
  const arrSec = depSec + (d.estimatedTimeEnrouteMin || 30) * 60;

  return (
    <div className={`brief3d ${entered ? "brief3d-in" : ""}`} data-tone={tone}>
      <div className="brief3d-watermark" aria-hidden>
        {d.verdict.replace("_", "-")}
      </div>

      <article className="brief3d-card brief3d-route" style={{ ["--d" as string]: "0ms" }}>
        <span className="brief3d-kicker">Route</span>
        <h2>
          {briefing.corridor.origin.icao}
          <em>→</em>
          {briefing.corridor.destination.icao}
        </h2>
        <p>
          {nm} NM · {briefing.corridor.cruiseAltitudeFt.toLocaleString()} ft ·{" "}
          {d.estimatedTimeEnrouteMin} min
        </p>
        <p className="brief3d-sub">{briefing.corridor.aircraft.modelName}</p>
      </article>

      <article className="brief3d-card brief3d-verdict" style={{ ["--d" as string]: "80ms" }}>
        <span className="brief3d-kicker">VFR decision</span>
        <div className={`brief3d-stamp brief3d-stamp-${tone}`}>
          {d.verdict.replace("_", "-")}
        </div>
        <p className="brief3d-summary">{synopsis}</p>
        <div className="brief3d-chips">
          <button type="button" className={section === "stops" ? "on" : ""} onClick={() => setSection(section === "stops" ? null : "stops")}>
            Stops {d.blockers.length}
          </button>
          <button type="button" className={section === "forecast" ? "on" : ""} onClick={() => setSection(section === "forecast" ? null : "forecast")}>
            Forecast
          </button>
          <button type="button" className={section === "charts" ? "on" : ""} onClick={() => setSection(section === "charts" ? null : "charts")}>
            NOAA charts
          </button>
          <button type="button" className={section === "hazards" ? "on" : ""} onClick={() => setSection(section === "hazards" ? null : "hazards")}>
            Hazards {hazards.length}
          </button>
        </div>
      </article>

      <article className="brief3d-card brief3d-metrics" style={{ ["--d" as string]: "160ms" }}>
        <span className="brief3d-kicker">Performance</span>
        <div className="brief3d-grid">
          <div>
            <small>Terrain</small>
            <b>{d.minTerrainClearanceFt.toLocaleString()} ft</b>
          </div>
          <div>
            <small>Clouds</small>
            <b>{d.cloudBufferFt === 99999 ? "Clear" : `${d.cloudBufferFt.toLocaleString()} ft`}</b>
          </div>
          <div>
            <small>Fuel</small>
            <b>{d.fuelRequiredGal} gal</b>
          </div>
          <div>
            <small>Groundspeed</small>
            <b>{d.groundSpeedKt} kt</b>
          </div>
        </div>
        <p className="brief3d-sub">
          Depart {d.recommendedDepRunway || "—"} · Land {d.recommendedArrRunway || "—"}
        </p>
        <p className="brief3d-sub">
          Dep wind {weather.origin.windDirDeg.toString().padStart(3, "0")}°/{weather.origin.windSpeedKt} · Arr{" "}
          {weather.destination.windDirDeg.toString().padStart(3, "0")}°/{weather.destination.windSpeedKt}
        </p>
      </article>

      <article className="brief3d-card brief3d-sources" style={{ ["--d" as string]: "240ms" }}>
        <span className="brief3d-kicker">Live products</span>
        <div className="brief3d-source-row">
          {(intel?.sourcesUsed || ["METAR"]).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </article>

      {section && (
        <article className="brief3d-card brief3d-drawer" key={section}>
          <header>
            <strong>
              {section === "stops"
                ? "Hard stops & cautions"
                : section === "forecast"
                ? "Forecast windows"
                : section === "charts"
                ? "NOAA charts"
                : "Hazards along the corridor"}
            </strong>
            <button type="button" onClick={() => setSection(null)}>
              Close
            </button>
          </header>

          {section === "stops" && (
            <div className="brief3d-list">
              {stops.length === 0 && <p>No stops on this plan.</p>}
              {stops.map((f) => (
                <div key={f.id} className={f.severity === "stop" ? "stop" : "caution"}>
                  <b>
                    {f.title} · {f.source}
                  </b>
                  <p>{f.plain}</p>
                </div>
              ))}
            </div>
          )}

          {section === "hazards" && (
            <div className="brief3d-list">
              {hazards.length === 0 && <p>Nothing along the corridor in this pull.</p>}
              {hazards.map((f) => (
                <div key={f.id} className={f.severity === "stop" ? "stop" : "caution"}>
                  <b>
                    {f.title} · {f.source}
                  </b>
                  <p>{f.plain}</p>
                </div>
              ))}
            </div>
          )}

          {section === "forecast" && (
            <div className="brief3d-list">
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
                <div key={block.label}>
                  <b>
                    {block.icao} {block.label} · {block.w.flightCategory}
                  </b>
                  <p>
                    {block.from && block.to
                      ? formatTafWindow(block.from, block.to)
                      : "Observation only"}
                    {" · "}
                    Wind {block.w.windDirDeg.toString().padStart(3, "0")}° at {block.w.windSpeedKt} kt
                  </p>
                  {block.note && <p>{block.note}</p>}
                </div>
              ))}
              {(intel?.enroute || []).map((e) => (
                <div key={e.icao}>
                  <b>
                    {e.icao} along route · {e.weather.flightCategory}
                  </b>
                  <p>
                    {e.periodFrom && e.periodTo
                      ? formatTafWindow(e.periodFrom, e.periodTo)
                      : "No TAF window"}
                  </p>
                </div>
              ))}
              <p className="brief3d-hint">
                Times shown relative to departure {new Date(depSec * 1000).toLocaleTimeString()} · arrival{" "}
                {new Date(arrSec * 1000).toLocaleTimeString()}
              </p>
            </div>
          )}

          {section === "charts" && (
            <div className="brief3d-charts">
              <div className="brief3d-chart-picks">
                {NOAA_CHARTS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={chartId === c.id ? "on" : ""}
                    onClick={() => setChartId(c.id)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
              <img src={`/api/noaa-chart?id=${chart.id}`} alt={chart.title} />
              <p className="brief3d-hint">{chart.note}</p>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
