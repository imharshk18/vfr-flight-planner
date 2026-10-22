"use client";

import { useState } from 'react';
import { ArrowRight, Plane, SlidersHorizontal, Wind } from 'lucide-react';
import { DEFAULT_AIRCRAFT } from '@/lib/aircraft-fleet';
import { DEMO_ROUTES, intakeFromDemo, type DemoRoute } from '@/lib/demo-routes';
import type { MissionIntake } from '@/lib/mission-types';

export default function MissionIntakeModal({ loading, status, initial, onSubmit, onClose }: {
  loading: boolean; status: string; initial?: MissionIntake; onSubmit: (intake: MissionIntake, demo?: DemoRoute) => void; onClose?: () => void;
}) {
  const [form, setForm] = useState<MissionIntake>(initial || { ...intakeFromDemo(DEMO_ROUTES[0]), altitudeMode: 'recommended' });
  const [demoId, setDemoId] = useState<string | null>(initial ? null : 'clear_vfr');
  const aircraft = DEFAULT_AIRCRAFT.find(a => a.id === form.aircraftId)!;
  const ramp = aircraft.emptyWeightLbs + form.wb.pilotWeightLbs + form.wb.passengerWeightLbs + form.wb.baggageLbs + form.wb.fuelGallons * 6;
  const change = <K extends keyof MissionIntake>(key: K, value: MissionIntake[K]) => setForm(f => ({ ...f, [key]: value }));
  return <div className="mission-overlay"><form className="mission-console" onSubmit={e => { e.preventDefault(); if (!loading) onSubmit(form, DEMO_ROUTES.find(d => d.id === demoId)); }}>
    <div className="console-heading"><span className="eyebrow"><Plane size={15} /> AEROTWIN / FLIGHT DECK</span>{onClose && <button type="button" className="quiet-button" onClick={onClose}>Close</button>}</div>
    <div className="mission-title"><h1>Your flight.<br /><span>Before you fly.</span></h1><p>Build your mission. Explore the terrain.<br />See the weather in three dimensions.</p></div>
    <div className="preset-row">{DEMO_ROUTES.map(d => <button type="button" key={d.id} className={`preset ${demoId === d.id ? 'selected' : ''}`} onClick={() => { setDemoId(d.id); setForm({ ...intakeFromDemo(d), departureLocal: form.departureLocal }); }}><span className={`status-dot ${d.tone}`} /><span><strong>{d.title}</strong><small>{d.id === 'clear_vfr' ? 'Clear skies · demo' : 'Marine layer · demo'}</small></span><ArrowRight size={16} /></button>)}</div>
    <fieldset disabled={loading}>
      <div className="section-label"><span>01</span> ROUTE & DEPARTURE</div>
      <div className="form-grid three"><label>Departure airport<input required pattern="[A-Za-z0-9]{3,4}" maxLength={4} value={form.originIcao} onChange={e => { change('originIcao', e.target.value.toUpperCase()); setDemoId(null); }} /></label><label>Arrival airport<input required pattern="[A-Za-z0-9]{3,4}" maxLength={4} value={form.destinationIcao} onChange={e => { change('destinationIcao', e.target.value.toUpperCase()); setDemoId(null); }} /></label><label>Departure · local time<input type="datetime-local" value={form.departureLocal} onChange={e => change('departureLocal', e.target.value)} /></label></div>
      <div className="form-grid two"><label>Route style<select value={form.routeMode} onChange={e => change('routeMode', e.target.value as MissionIntake['routeMode'])}><option value="pilotage">Visual landmarks / pilotage</option><option value="straight">Direct / great circle</option></select></label><label>Weather source<select value={demoId || 'live'} onChange={e => setDemoId(e.target.value === 'live' ? null : e.target.value)}><option value="live">Live METAR / departure TAF</option>{DEMO_ROUTES.filter(d => d.originIcao === form.originIcao && d.destinationIcao === form.destinationIcao).map(d => <option key={d.id} value={d.id}>Preset scenario weather</option>)}</select></label></div>
      <div className="section-label"><span>02</span> AIRCRAFT & LOADING</div>
      <label>Aircraft<select value={form.aircraftId} onChange={e => { const a = DEFAULT_AIRCRAFT.find(a => a.id === e.target.value)!; setForm(f => ({ ...f, aircraftId: a.id, wb: { ...f.wb, fuelGallons: Math.min(f.wb.fuelGallons, a.usableFuelGal) } })); }}>{DEFAULT_AIRCRAFT.map(a => <option key={a.id} value={a.id}>{a.modelName}</option>)}</select></label>
      <div className="form-grid four">{([['pilotWeightLbs','Pilot · lb'],['passengerWeightLbs','Passengers · lb'],['baggageLbs','Baggage · lb'],['fuelGallons','Fuel · gal']] as const).map(([key,label]) => <label key={key}>{label}<input type="number" min={0} max={key === 'fuelGallons' ? aircraft.usableFuelGal : 1500} step="0.1" required value={form.wb[key]} onChange={e => change('wb', { ...form.wb, [key]: Number(e.target.value) })} /></label>)}</div>
      <div className="weight-strip"><span>RAMP WEIGHT <b className={ramp > aircraft.maxGrossWeightLbs ? 'danger-text' : ''}>{Math.round(ramp).toLocaleString()} / {aircraft.maxGrossWeightLbs.toLocaleString()} lb</b></span><span>Loading estimate · CG not calculated</span></div>
      <div className="section-label"><span>03</span> CRUISE ALTITUDE</div>
      <div className="altitude-row"><div className="segmented">{(['recommended','manual'] as const).map(mode => <button type="button" className={form.altitudeMode === mode ? 'active' : ''} key={mode} onClick={() => change('altitudeMode', mode)}>{mode === 'recommended' ? 'Auto recommend' : 'Set altitude'}</button>)}</div>{form.altitudeMode === 'manual' ? <label className="altitude-field"><input aria-label="Cruise altitude feet MSL" type="number" min={3500} max={aircraft.serviceCeilingFt} step={500} value={form.cruiseAltitudeFt} onChange={e => change('cruiseAltitudeFt', Number(e.target.value))} /> ft MSL</label> : <span className="muted small"><SlidersHorizontal size={14} /> VFR hemispheric · clears terrain by 1,500 ft</span>}</div>
    </fieldset>
    <div className="mission-footer"><span><Wind size={15} /> {demoId ? 'Scenario weather · real terrain' : 'Observations + available TAF'}</span><button disabled={loading} type="submit" className="primary-button">{loading ? status || 'Preparing flight…' : 'Build 3D flight'}{!loading && <ArrowRight size={18} />}</button></div>
    <p className="fine-print">Flight rehearsal / preliminary checks. Not a navigation or dispatch clearance.</p>
  </form></div>;
}
