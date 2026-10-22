"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plane, SlidersHorizontal } from "lucide-react";
import { DEFAULT_AIRCRAFT } from "@/lib/aircraft-fleet";
import { DEMO_ROUTES, intakeFromDemo, type DemoRoute } from "@/lib/demo-routes";
import type { MissionIntake } from "@/lib/mission-types";
import { calculateLoading } from "@/lib/weight-balance";

function defaultDepartureLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function blankLiveIntake(): MissionIntake {
  return {
    originIcao: "KMSN",
    destinationIcao: "KRFD",
    routeMode: "straight",
    altitudeMode: "recommended",
    cruiseAltitudeFt: 5500,
    departureLocal: defaultDepartureLocal(),
    aircraftId: "c172s",
    wb: {
      pilotWeightLbs: 170,
      passengerWeightLbs: 0,
      rearLeftWeightLbs: 0,
      rearRightWeightLbs: 0,
      baggageLbs: 15,
      fuelGallons: 40,
    },
  };
}

export default function MissionIntakeModal({
  loading,
  status,
  initial,
  onSubmit,
  onClose,
}: {
  loading: boolean;
  status: string;
  initial?: MissionIntake;
  onSubmit: (intake: MissionIntake, demo?: DemoRoute) => void;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<MissionIntake>(
    initial || { ...blankLiveIntake(), departureLocal: defaultDepartureLocal() }
  );
  // null = live METAR/TAF/NOTAM pipeline (default)
  const [demoId, setDemoId] = useState<string | null>(initial ? null : null);
  const aircraft = DEFAULT_AIRCRAFT.find((a) => a.id === form.aircraftId)!;
  const loadingResult = calculateLoading(aircraft, form.wb);
  const change = <K extends keyof MissionIntake>(key: K, value: MissionIntake[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const matchingDemos = useMemo(
    () =>
      DEMO_ROUTES.filter(
        (d) => d.originIcao === form.originIcao && d.destinationIcao === form.destinationIcao
      ),
    [form.originIcao, form.destinationIcao]
  );

  return (
    <div className="mission-overlay">
      <form
        className="mission-console"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) onSubmit(form, DEMO_ROUTES.find((d) => d.id === demoId));
        }}
      >
        <div className="console-heading">
          <span className="eyebrow">
            <Plane size={15} /> AEROTWIN
          </span>
          {onClose && (
            <button type="button" className="quiet-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>

        <div className="mission-title">
          <h1>
            Plan the corridor.
            <br />
            <span>Then fly it in 3D.</span>
          </h1>
        </div>

        <div className="preset-row">
          <button
            type="button"
            className={`preset ${demoId === null ? "selected" : ""}`}
            onClick={() => {
              setDemoId(null);
              setForm((f) => ({
                ...f,
                routeMode: "straight",
                altitudeMode: "recommended",
                departureLocal: f.departureLocal || defaultDepartureLocal(),
              }));
            }}
          >
            <span className="status-dot good" />
            <span>
              <strong>Live brief</strong>
              <small>METAR · TAF · AIRMET · NOTAM</small>
            </span>
            <ArrowRight size={16} />
          </button>
          {DEMO_ROUTES.map((d) => (
            <button
              type="button"
              key={d.id}
              className={`preset ${demoId === d.id ? "selected" : ""}`}
              onClick={() => {
                setDemoId(d.id);
                setForm({
                  ...intakeFromDemo(d),
                  departureLocal: form.departureLocal || defaultDepartureLocal(),
                });
              }}
            >
              <span className={`status-dot ${d.tone}`} />
              <span>
                <strong>{d.title}</strong>
                <small>{d.id === "clear_vfr" ? "GO demo" : "NO-GO demo"}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>

        <fieldset disabled={loading}>
          <div className="section-label">
            <span>01</span> ROUTE
          </div>
          <div className="form-grid three">
            <label>
              Departure
              <input
                required
                pattern="[A-Za-z0-9]{3,4}"
                maxLength={4}
                value={form.originIcao}
                onChange={(e) => {
                  change("originIcao", e.target.value.toUpperCase());
                  setDemoId(null);
                }}
              />
            </label>
            <label>
              Arrival
              <input
                required
                pattern="[A-Za-z0-9]{3,4}"
                maxLength={4}
                value={form.destinationIcao}
                onChange={(e) => {
                  change("destinationIcao", e.target.value.toUpperCase());
                  setDemoId(null);
                }}
              />
            </label>
            <label>
              Departure time
              <input
                type="datetime-local"
                required
                value={form.departureLocal}
                onChange={(e) => change("departureLocal", e.target.value)}
              />
            </label>
          </div>

          <div className="form-grid two">
            <label>
              Path
              <select
                value={form.routeMode}
                onChange={(e) =>
                  change("routeMode", e.target.value as MissionIntake["routeMode"])
                }
              >
                <option value="straight">Direct / great circle</option>
                <option value="pilotage">Pilotage / landmarks</option>
              </select>
            </label>
            <label>
              Weather
              <select
                value={demoId || "live"}
                onChange={(e) => setDemoId(e.target.value === "live" ? null : e.target.value)}
              >
                <option value="live">Live METAR / TAF / hazards</option>
                {matchingDemos.map((d) => (
                  <option key={d.id} value={d.id}>
                    Preset · {d.badge}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="section-label">
            <span>02</span> AIRCRAFT
          </div>
          <label>
            Airplane
            <select
              value={form.aircraftId}
              onChange={(e) => {
                const a = DEFAULT_AIRCRAFT.find((x) => x.id === e.target.value)!;
                setForm((f) => ({
                  ...f,
                  aircraftId: a.id,
                  wb: { ...f.wb, fuelGallons: Math.min(f.wb.fuelGallons, a.usableFuelGal) },
                }));
              }}
            >
              {DEFAULT_AIRCRAFT.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.modelName}
                </option>
              ))}
            </select>
          </label>

          <div className="seat-grid">
            {(
              [
                ["pilotWeightLbs", "Pilot"],
                ["passengerWeightLbs", "Copilot"],
                ["rearLeftWeightLbs", "Rear L"],
                ["rearRightWeightLbs", "Rear R"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={500}
                  step="1"
                  required
                  value={form.wb[key]}
                  onChange={(e) =>
                    change("wb", { ...form.wb, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>

          <div className="form-grid two load-support">
            <label>
              Baggage · lb
              <input
                type="number"
                min={0}
                max={120}
                step="1"
                required
                value={form.wb.baggageLbs}
                onChange={(e) =>
                  change("wb", { ...form.wb, baggageLbs: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Fuel · gal
              <input
                type="number"
                min={0}
                max={aircraft.usableFuelGal}
                step="0.1"
                required
                value={form.wb.fuelGallons}
                onChange={(e) =>
                  change("wb", { ...form.wb, fuelGallons: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <div className="weight-strip">
            <span>
              RAMP{" "}
              <b className={!loadingResult.weightLegal ? "danger-text" : ""}>
                {Math.round(loadingResult.rampWeightLbs).toLocaleString()} /{" "}
                {(aircraft.maxRampWeightLbs ?? aircraft.maxGrossWeightLbs).toLocaleString()} lb
              </b>
            </span>
            <span>
              CG{" "}
              <b className={!loadingResult.cgLegal ? "danger-text" : ""}>
                {loadingResult.centerOfGravityIn.toFixed(1)} in ·{" "}
                {loadingResult.cgLegal ? "OK" : "OUT"}
              </b>
            </span>
          </div>

          <div className="section-label">
            <span>03</span> CRUISE
          </div>
          <div className="altitude-row">
            <div className="segmented">
              {(["recommended", "manual"] as const).map((mode) => (
                <button
                  type="button"
                  className={form.altitudeMode === mode ? "active" : ""}
                  key={mode}
                  onClick={() => change("altitudeMode", mode)}
                >
                  {mode === "recommended" ? "Auto VFR" : "Manual"}
                </button>
              ))}
            </div>
            {form.altitudeMode === "manual" ? (
              <label className="altitude-field">
                <input
                  aria-label="Cruise altitude feet MSL"
                  type="number"
                  min={3500}
                  max={aircraft.serviceCeilingFt}
                  step={500}
                  value={form.cruiseAltitudeFt}
                  onChange={(e) => change("cruiseAltitudeFt", Number(e.target.value))}
                />{" "}
                ft MSL
              </label>
            ) : (
              <span className="muted small">
                <SlidersHorizontal size={14} /> Hemispheric · terrain + 1,500 ft
              </span>
            )}
          </div>
        </fieldset>

        <div className="mission-footer">
          <span className="footer-source">
            {demoId
              ? "Demo weather · real terrain"
              : `Live wx for ${form.departureLocal ? new Date(form.departureLocal).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "now"}`}
          </span>
          <button disabled={loading} type="submit" className="primary-button">
            {loading ? status || "Preparing…" : "Build 3D flight"}
            {!loading && <ArrowRight size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
