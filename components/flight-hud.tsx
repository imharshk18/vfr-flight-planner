"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  Plane,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Plus,
  X,
  Zap,
  Wind,
  Gauge,
  Fuel,
  Mountain,
  Cloud,
  Clock,
  Weight,
  RefreshCw,
  Sliders,
} from "lucide-react";
import type {
  AircraftProfile,
  WeightAndBalanceState,
  FlightCorridor,
} from "@/lib/aviation-types";
import { DEFAULT_AIRCRAFT, loadCustomAircraft, addCustomAircraft } from "@/lib/aircraft-fleet";

// ---- Mini badge ----

function Badge({
  category,
}: {
  category: "VFR" | "MVFR" | "IFR" | "LIFR";
}) {
  const colors: Record<string, string> = {
    VFR: "bg-emerald-600 text-white",
    MVFR: "bg-blue-600 text-white",
    IFR: "bg-red-600 text-white",
    LIFR: "bg-fuchsia-700 text-white",
  };
  return (
    <span className={clsx("px-2 py-0.5 rounded text-xs font-bold", colors[category])}>
      {category}
    </span>
  );
}

// ---- Slider row ----

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-mono text-slate-400">
        <span>{label}</span>
        <span className={color || "text-cyan-400"}>
          {typeof value === "number" ? value.toLocaleString() : value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none rounded-full cursor-pointer accent-cyan-400"
      />
    </div>
  );
}

// ---- Custom aircraft modal ----

function CustomAircraftModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (profile: AircraftProfile) => void;
}) {
  const [form, setForm] = useState({
    tailNumber: "",
    modelName: "",
    emptyWeightLbs: 1663,
    maxGrossWeightLbs: 2550,
    usefulLoadLbs: 887,
    usableFuelGal: 53,
    fuelBurnGph: 8.8,
    cruiseTasKt: 122,
    serviceCeilingFt: 14000,
    seaLevelClimbFpm: 730,
    maxCrosswindKt: 15,
  });

  const set = (key: string, val: string | number) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    if (!form.tailNumber || !form.modelName) return;
    const saved = addCustomAircraft(form);
    onSave(saved);
    onClose();
  };

  const fields: Array<{
    key: keyof typeof form;
    label: string;
    type: "text" | "number";
    step?: number;
    min?: number;
  }> = [
    { key: "tailNumber", label: "Tail Number", type: "text" },
    { key: "modelName", label: "Model Name", type: "text" },
    { key: "emptyWeightLbs", label: "Basic Empty Weight (lbs)", type: "number", min: 500, step: 1 },
    { key: "maxGrossWeightLbs", label: "Max Gross Weight (lbs)", type: "number", min: 500, step: 1 },
    { key: "usefulLoadLbs", label: "Useful Load (lbs)", type: "number", min: 100, step: 1 },
    { key: "usableFuelGal", label: "Usable Fuel (gal)", type: "number", min: 10, step: 0.5 },
    { key: "fuelBurnGph", label: "Fuel Burn (GPH)", type: "number", min: 3, step: 0.1 },
    { key: "cruiseTasKt", label: "Cruise TAS (kt)", type: "number", min: 60, step: 1 },
    { key: "serviceCeilingFt", label: "Service Ceiling (ft)", type: "number", min: 8000, step: 100 },
    { key: "seaLevelClimbFpm", label: "Sea Level Climb Rate (FPM)", type: "number", min: 200, step: 10 },
    { key: "maxCrosswindKt", label: "Max Demonstrated Crosswind (kt)", type: "number", min: 5, step: 1 },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1117] border border-cyan-900/50 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-cyan-900/30">
          <span className="text-cyan-400 font-mono font-bold text-sm">ADD CUSTOM AIRCRAFT PROFILE</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs font-mono text-slate-400">{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]}
                step={f.step}
                min={f.min}
                onChange={(e) =>
                  set(f.key, f.type === "number" ? parseFloat(e.target.value) : e.target.value)
                }
                className="bg-[#131b27] border border-slate-700 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-cyan-900/30 flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded py-2 text-sm font-mono font-bold transition-colors"
          >
            SAVE TO FLEET
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded py-2 text-sm font-mono transition-colors"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Stat tile ----

function StatTile({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={clsx(
        "bg-[#0d1117] border rounded-lg p-3 flex flex-col gap-1",
        alert ? "border-red-700/60" : "border-cyan-900/40"
      )}
    >
      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono">
        {icon}
        {label}
      </div>
      <div
        className={clsx(
          "text-lg font-bold font-mono",
          alert ? "text-red-400" : "text-cyan-300"
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 font-mono">{sub}</div>}
    </div>
  );
}

// ---- Props ----

export interface HudProps {
  origin: string;
  destination: string;
  cruiseAltitudeFt: number;
  selectedAircraftId: string;
  wb: WeightAndBalanceState;
  corridor: FlightCorridor | null;
  loading: boolean;
  progress: number;
  simulateMarineLayer: boolean;
  onOriginChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onCruiseAltChange: (v: number) => void;
  onAircraftChange: (id: string) => void;
  onWbChange: (wb: WeightAndBalanceState) => void;
  onFetchRoute: () => void;
  onProgressChange: (v: number) => void;
  onSimulateMarineLayerChange: (v: boolean) => void;
  onAutoOptimize: () => void;
  onPreset: (origin: string, dest: string, alt: number) => void;
}

export default function FlightHud(props: HudProps) {
  const {
    origin,
    destination,
    cruiseAltitudeFt,
    selectedAircraftId,
    wb,
    corridor,
    loading,
    progress,
    simulateMarineLayer,
    onOriginChange,
    onDestinationChange,
    onCruiseAltChange,
    onAircraftChange,
    onWbChange,
    onFetchRoute,
    onProgressChange,
    onSimulateMarineLayerChange,
    onAutoOptimize,
    onPreset,
  } = props;

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customAircraft, setCustomAircraft] = useState<AircraftProfile[]>([]);
  const [showWb, setShowWb] = useState(false);

  useEffect(() => {
    setCustomAircraft(loadCustomAircraft());
  }, []);

  const allAircraft = [...DEFAULT_AIRCRAFT, ...customAircraft];
  const selected = allAircraft.find((a) => a.id === selectedAircraftId) || DEFAULT_AIRCRAFT[1];

  const handleCustomSave = (profile: AircraftProfile) => {
    setCustomAircraft(loadCustomAircraft());
    onAircraftChange(profile.id);
  };

  const decision = corridor?.decision;

  const verdictStyle = decision
    ? decision.verdict === "GO"
      ? "border-emerald-500/60 text-emerald-400 shadow-emerald-900/30"
      : decision.verdict === "MARGINAL"
      ? "border-amber-500/60 text-amber-400 shadow-amber-900/30"
      : "border-red-500/60 text-red-400 shadow-red-900/30"
    : "border-slate-700 text-slate-400";

  return (
    <div className="flex flex-col h-full bg-[#070709] text-white overflow-y-auto">
      {/* Top nav bar */}
      <div className="border-b border-cyan-900/40 p-3 space-y-3">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-1">
          <Plane size={18} className="text-cyan-400" />
          <span className="text-cyan-400 font-mono font-bold text-sm tracking-widest">
            AEROTWIN 3D
          </span>
          <span className="text-slate-600 text-xs font-mono ml-auto">VFR CORRIDOR ENGINE</span>
        </div>

        {/* Route inputs */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-500 font-mono block mb-1">DEPARTURE</label>
            <input
              value={origin}
              onChange={(e) => onOriginChange(e.target.value.toUpperCase())}
              placeholder="KSQL"
              maxLength={6}
              className="w-full bg-[#131b27] border border-slate-700 rounded px-3 py-2 text-cyan-300 font-mono text-sm focus:outline-none focus:border-cyan-500 placeholder:text-slate-600 uppercase"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 font-mono block mb-1">DESTINATION</label>
            <input
              value={destination}
              onChange={(e) => onDestinationChange(e.target.value.toUpperCase())}
              placeholder="KMRY"
              maxLength={6}
              className="w-full bg-[#131b27] border border-slate-700 rounded px-3 py-2 text-cyan-300 font-mono text-sm focus:outline-none focus:border-cyan-500 placeholder:text-slate-600 uppercase"
            />
          </div>
        </div>

        {/* Cruise alt slider */}
        <SliderRow
          label="CRUISE ALTITUDE"
          value={cruiseAltitudeFt}
          min={1500}
          max={13500}
          step={500}
          unit="ft MSL"
          onChange={onCruiseAltChange}
        />

        {/* Aircraft selector */}
        <div>
          <label className="text-xs text-slate-500 font-mono block mb-1">AIRCRAFT</label>
          <div className="flex gap-2">
            <select
              value={selectedAircraftId}
              onChange={(e) => onAircraftChange(e.target.value)}
              className="flex-1 bg-[#131b27] border border-slate-700 rounded px-3 py-2 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <optgroup label="Standard Fleet">
                {DEFAULT_AIRCRAFT.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tailNumber} - {a.modelName}
                  </option>
                ))}
              </optgroup>
              {customAircraft.length > 0 && (
                <optgroup label="Custom Profiles">
                  {customAircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tailNumber} - {a.modelName}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={() => setShowCustomModal(true)}
              className="bg-[#131b27] border border-slate-700 hover:border-cyan-600 rounded px-3 py-2 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Add custom tail"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="text-xs text-slate-600 font-mono mt-1">
            BEW {selected.emptyWeightLbs.toLocaleString()} lbs | MGTOW {selected.maxGrossWeightLbs.toLocaleString()} lbs | {selected.cruiseTasKt} kt TAS | {selected.seaLevelClimbFpm} FPM SL
          </div>
        </div>

        {/* Fetch button */}
        <button
          onClick={onFetchRoute}
          disabled={loading || !origin || !destination}
          className={clsx(
            "w-full flex items-center justify-center gap-2 rounded py-2.5 font-mono font-bold text-sm transition-all",
            loading
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-cyan-700 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-900/30"
          )}
        >
          {loading ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              FETCHING LIVE DATA...
            </>
          ) : (
            <>
              <Zap size={15} />
              FETCH LIVE ROUTE DATA
            </>
          )}
        </button>

        {/* Quick presets */}
        <div className="space-y-1">
          <div className="text-xs text-slate-600 font-mono">QUICK PRESETS</div>
          <div className="grid grid-cols-1 gap-1">
            {[
              { label: "KSQL to KMRY (Marine Layer Cloud Trap)", o: "KSQL", d: "KMRY", alt: 3500 },
              { label: "KSQL to O22 (Sierra Foothills VFR Passage)", o: "KSQL", d: "O22", alt: 5500 },
              { label: "KPAO to KTRK (Alpine High Density Alt Challenge)", o: "KPAO", d: "KTRK", alt: 9500 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => onPreset(preset.o, preset.d, preset.alt)}
                className="text-left text-xs font-mono text-slate-400 hover:text-cyan-400 bg-[#0d1117] hover:bg-[#131b27] border border-slate-800 hover:border-cyan-900 rounded px-2 py-1.5 transition-all truncate"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Decision banner */}
      {decision && (
        <div
          className={clsx(
            "mx-3 mt-3 border rounded-lg p-3 shadow-lg",
            verdictStyle
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            {decision.verdict === "GO" ? (
              <CheckCircle size={16} className="text-emerald-400" />
            ) : decision.verdict === "MARGINAL" ? (
              <AlertCircle size={16} className="text-amber-400" />
            ) : (
              <AlertTriangle size={16} className="text-red-400" />
            )}
            <span className="font-mono font-bold text-sm">
              {decision.verdict === "GO"
                ? "[GO - VFR APPROVED]"
                : decision.verdict === "MARGINAL"
                ? "[MARGINAL - PIC JUDGMENT]"
                : "[NO-GO - REGULATORY VIOLATION]"}
            </span>
          </div>
          <p className="text-xs text-slate-300 font-mono leading-relaxed">
            {decision.summary}
          </p>
        </div>
      )}

      {/* Blockers */}
      {decision && decision.blockers.length > 0 && (
        <div className="mx-3 mt-2 space-y-1">
          {decision.blockers.map((b, i) => (
            <div key={i} className="bg-red-950/40 border border-red-800/40 rounded p-2 text-xs font-mono text-red-300 leading-relaxed">
              <AlertTriangle size={11} className="inline mr-1 text-red-400" />
              {b}
            </div>
          ))}
        </div>
      )}

      {/* Cautions */}
      {decision && decision.cautions.length > 0 && (
        <div className="mx-3 mt-1 space-y-1">
          {decision.cautions.map((c, i) => (
            <div key={i} className="bg-amber-950/30 border border-amber-800/30 rounded p-2 text-xs font-mono text-amber-300 leading-relaxed">
              <AlertCircle size={11} className="inline mr-1 text-amber-400" />
              {c}
            </div>
          ))}
        </div>
      )}

      {/* Citations */}
      {decision && decision.regulatoryCitations.length > 0 && (
        <div className="mx-3 mt-1 flex flex-wrap gap-1">
          {decision.regulatoryCitations.map((cit, i) => (
            <span key={i} className="text-xs font-mono text-slate-500 bg-slate-900 border border-slate-800 rounded px-2 py-0.5">
              {cit}
            </span>
          ))}
        </div>
      )}

      {/* Performance telemetry grid */}
      {corridor && decision && (
        <div className="mx-3 mt-3 space-y-2">
          <div className="text-xs text-slate-500 font-mono">PERFORMANCE TELEMETRY</div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              icon={<Clock size={11} />}
              label="ETE"
              value={`${decision.estimatedTimeEnrouteMin} min`}
              sub={`GS ${decision.groundSpeedKt} kt`}
            />
            <StatTile
              icon={<Wind size={11} />}
              label="WIND COMPONENTS"
              value={`HW ${decision.headwindComponentKt > 0 ? "+" : ""}${decision.headwindComponentKt.toFixed(0)} kt`}
              sub={`XW ${decision.crosswindComponentKt.toFixed(0)} kt`}
              alert={decision.crosswindComponentKt > selected.maxCrosswindKt}
            />
            <StatTile
              icon={<Fuel size={11} />}
              label="FUEL STATUS"
              value={`${wb.fuelGallons.toFixed(1)} gal`}
              sub={`Burn ${decision.fuelRequiredGal} gal | Res ${decision.reserveFuelRemainingGal.toFixed(1)} gal`}
              alert={decision.reserveFuelRemainingGal < selected.fuelBurnGph * 0.5}
            />
            <StatTile
              icon={<Gauge size={11} />}
              label="CLIMB RATE"
              value={`${decision.calculatedClimbRateFpm} FPM`}
              sub="at departure DA"
              alert={decision.calculatedClimbRateFpm < 250}
            />
            <StatTile
              icon={<Mountain size={11} />}
              label="TERRAIN CLEAR"
              value={`${decision.minTerrainClearanceFt.toLocaleString()} ft`}
              sub="cruise above peak"
              alert={decision.minTerrainClearanceFt < 1000}
            />
            <StatTile
              icon={<Cloud size={11} />}
              label="CLOUD BUFFER"
              value={decision.cloudBufferFt === 99999 ? "CLEAR" : `${decision.cloudBufferFt.toLocaleString()} ft`}
              sub="pattern to ceiling"
              alert={decision.cloudBufferFt !== 99999 && decision.cloudBufferFt < 500}
            />
          </div>

          {/* Weight status */}
          <div
            className={clsx(
              "border rounded-lg p-3",
              decision.weightStatus === "OVERWEIGHT"
                ? "border-red-700/60 bg-red-950/30"
                : "border-emerald-900/40 bg-[#0d1117]"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <Weight size={11} />
                WEIGHT STATUS
              </div>
              <span
                className={clsx(
                  "text-xs font-bold font-mono",
                  decision.weightStatus === "OVERWEIGHT" ? "text-red-400" : "text-emerald-400"
                )}
              >
                {decision.weightStatus}
              </span>
            </div>
            <div className="text-sm font-mono text-cyan-300 font-bold">
              {decision.totalRampWeightLbs.toLocaleString()} lbs
            </div>
            <div className="text-xs text-slate-500 font-mono">
              of {selected.maxGrossWeightLbs.toLocaleString()} lbs MGTOW
            </div>
            <div className="mt-2 bg-slate-900 rounded-full h-1.5">
              <div
                className={clsx(
                  "h-1.5 rounded-full transition-all",
                  decision.totalRampWeightLbs > selected.maxGrossWeightLbs
                    ? "bg-red-500"
                    : "bg-emerald-500"
                )}
                style={{
                  width: `${Math.min(100, (decision.totalRampWeightLbs / selected.maxGrossWeightLbs) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Weight and balance drawer */}
      <div className="mx-3 mt-2">
        <button
          onClick={() => setShowWb((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-mono text-slate-400 hover:text-cyan-400 bg-[#0d1117] border border-slate-800 hover:border-cyan-900 rounded px-3 py-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders size={12} />
            WEIGHT AND BALANCE
          </div>
          <ChevronDown
            size={12}
            className={clsx("transition-transform", showWb && "rotate-180")}
          />
        </button>
        {showWb && (
          <div className="bg-[#0d1117] border border-slate-800 border-t-0 rounded-b-lg p-3 space-y-3">
            <SliderRow
              label="PILOT WEIGHT"
              value={wb.pilotWeightLbs}
              min={100}
              max={300}
              step={5}
              unit="lbs"
              onChange={(v) => onWbChange({ ...wb, pilotWeightLbs: v })}
            />
            <SliderRow
              label="PASSENGER WEIGHT"
              value={wb.passengerWeightLbs}
              min={0}
              max={300}
              step={5}
              unit="lbs"
              onChange={(v) => onWbChange({ ...wb, passengerWeightLbs: v })}
            />
            <SliderRow
              label="BAGGAGE"
              value={wb.baggageLbs}
              min={0}
              max={120}
              step={5}
              unit="lbs"
              onChange={(v) => onWbChange({ ...wb, baggageLbs: v })}
            />
            <SliderRow
              label="FUEL"
              value={wb.fuelGallons}
              min={5}
              max={selected.usableFuelGal}
              step={0.5}
              unit="gal"
              onChange={(v) => onWbChange({ ...wb, fuelGallons: v })}
            />
            <div className="text-xs text-slate-500 font-mono pt-1 border-t border-slate-800">
              Fuel weight: {(wb.fuelGallons * 6).toFixed(0)} lbs (at 6.0 lbs/gal)
            </div>
          </div>
        )}
      </div>

      {/* Weather cards */}
      {corridor && (
        <div className="mx-3 mt-3 space-y-2">
          <div className="text-xs text-slate-500 font-mono">WEATHER OBSERVATIONS</div>
          {[
            { label: "DEPARTURE", wx: corridor.weather.origin },
            { label: "DESTINATION", wx: corridor.weather.destination },
          ].map(({ label, wx }) => (
            <div key={label} className="bg-[#0d1117] border border-cyan-900/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-slate-400">{label}</span>
                <Badge category={wx.flightCategory} />
              </div>
              <div className="text-xs font-mono text-slate-500 break-all leading-relaxed mb-2">
                {wx.rawMetar}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <div className="text-slate-600">WIND</div>
                  <div className="text-cyan-300">{wx.windDirDeg.toString().padStart(3, "0")}/{wx.windSpeedKt}kt</div>
                </div>
                <div>
                  <div className="text-slate-600">TEMP/DP</div>
                  <div className="text-cyan-300">{wx.tempC}/{wx.dewpointC}C</div>
                </div>
                <div>
                  <div className="text-slate-600">DENSITY ALT</div>
                  <div className={clsx(
                    wx.densityAltitudeFt > 6000 ? "text-amber-400" : "text-cyan-300"
                  )}>
                    {wx.densityAltitudeFt.toLocaleString()} ft
                  </div>
                </div>
              </div>
              {wx.ceilingAglFt !== null && (
                <div className="mt-1 text-xs font-mono text-amber-400">
                  Ceiling: {wx.ceilingAglFt.toLocaleString()} ft AGL
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* What-if toggles */}
      <div className="mx-3 mt-3 space-y-2">
        <div className="text-xs text-slate-500 font-mono">WHAT-IF SIMULATIONS</div>

        <button
          onClick={() => onSimulateMarineLayerChange(!simulateMarineLayer)}
          className={clsx(
            "w-full flex items-center gap-2 text-xs font-mono rounded px-3 py-2 border transition-all text-left",
            simulateMarineLayer
              ? "bg-cyan-950/40 border-cyan-700/60 text-cyan-300"
              : "bg-[#0d1117] border-slate-800 text-slate-400 hover:border-cyan-900 hover:text-slate-300"
          )}
        >
          <Cloud size={12} />
          <span className="flex-1">Simulate 2-Hr Marine Layer Burn-Off (+2,000 ft ceiling)</span>
          <span className={clsx("text-xs", simulateMarineLayer ? "text-cyan-400" : "text-slate-600")}>
            {simulateMarineLayer ? "ON" : "OFF"}
          </span>
        </button>

        <button
          onClick={onAutoOptimize}
          className="w-full flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-cyan-400 bg-[#0d1117] border border-slate-800 hover:border-cyan-900 rounded px-3 py-2 transition-all"
        >
          <Zap size={12} />
          Auto-Optimize Safe Altitude (clear terrain + clouds)
        </button>
      </div>

      {/* Flight scrub slider */}
      {corridor && (
        <div className="mx-3 mt-3 mb-3">
          <SliderRow
            label="FLIGHT POSITION SCRUB"
            value={progress}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={onProgressChange}
            color="text-cyan-400"
          />
        </div>
      )}

      {/* TFR status */}
      {corridor && corridor.tfrs.length > 0 && (
        <div className="mx-3 mt-2 mb-4 space-y-1">
          <div className="text-xs text-slate-500 font-mono">ACTIVE TFRS IN REGION</div>
          {corridor.tfrs.map((tfr) => {
            const isHit = corridor.decision.blockers.some((b) => b.includes(tfr.name));
            return (
              <div
                key={tfr.id}
                className={clsx(
                  "border rounded p-2 text-xs font-mono",
                  isHit
                    ? "border-red-700/60 bg-red-950/30 text-red-300"
                    : "border-amber-800/30 bg-amber-950/20 text-amber-400"
                )}
              >
                <div className="font-bold">{tfr.name}</div>
                <div className="text-slate-500">
                  {tfr.radiusNm} NM radius | SFC-{tfr.ceilingMsl.toLocaleString()} ft MSL | {tfr.notamRef}
                </div>
                {isHit && <div className="text-red-400 mt-0.5">CONFLICT: Flight path intersects this TFR</div>}
              </div>
            );
          })}
        </div>
      )}

      {showCustomModal && (
        <CustomAircraftModal
          onClose={() => setShowCustomModal(false)}
          onSave={handleCustomSave}
        />
      )}
    </div>
  );
}
