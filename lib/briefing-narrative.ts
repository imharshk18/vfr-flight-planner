import type { VfrCorridorDecision } from "./aviation-types";
import type { HazardAdvisory, PirepReport, WeatherIntel } from "./aviation-intel";

export type BriefFinding = {
  id: string;
  severity: "stop" | "caution" | "info";
  title: string;
  plain: string;
  source: string;
};

const HAZARD_PLAIN: Record<string, string> = {
  IFR: "Low clouds or poor visibility that can make VFR flying illegal or unsafe",
  ICE: "Icing conditions that can build ice on the airplane",
  TURB: "Turbulence reported or forecast along the route",
  MTN: "Mountain obscuration — peaks and ridges may be hidden in cloud",
  SFC_WND: "Strong surface winds",
  LLWS: "Low-level wind shear near the ground",
  CONV: "Thunderstorms or convective activity",
  TS: "Thunderstorms",
  TFR: "Temporary flight restriction — airspace you must avoid",
  CWA: "Center Weather Advisory from ATC weather unit",
};

export function plainHazard(hazard: string): string {
  const key = Object.keys(HAZARD_PLAIN).find((k) => new RegExp(k, "i").test(hazard));
  return key ? HAZARD_PLAIN[key] : `Weather advisory for ${hazard}`;
}

export function plainBlocker(raw: string): string {
  const t = raw.trim();
  if (/flight category|IFR|LIFR|MVFR/i.test(t) && /depart|origin|dep/i.test(t))
    return "Departure weather is below VFR minimums for this plan. Wait for improvement or file IFR.";
  if (/flight category|IFR|LIFR|MVFR/i.test(t) && /arriv|dest|eta/i.test(t))
    return "Arrival weather at your ETA is forecast below VFR. Plan an alternate or delay.";
  if (/ceiling|cloud/i.test(t) && /500|buffer|clearance/i.test(t))
    return "Your cruise altitude is too close to the cloud layer. Climb, descend, or wait for higher ceilings.";
  if (/terrain/i.test(t))
    return "Not enough clearance over terrain along the corridor at this altitude.";
  if (/crosswind|cross wind/i.test(t))
    return "Crosswind at the selected runway is above what this airplane demonstrates. Pick another runway or wait.";
  if (/fuel|reserve/i.test(t))
    return "Fuel on board does not cover the flight plus the required VFR reserve.";
  if (/weight|gross|overweight/i.test(t))
    return "Airplane is over max takeoff weight with the loaded fuel and passengers.";
  if (/SIGMET/i.test(t))
    return "A SIGMET (significant weather) is active near your route — treat as a hard stop for VFR.";
  if (/AIRMET.*IFR|G-AIRMET IFR/i.test(t))
    return "An AIRMET for IFR conditions covers part of your corridor.";
  if (/PIREP|severe/i.test(t))
    return "A recent pilot report shows severe weather near the corridor.";
  if (/TFR/i.test(t))
    return "A temporary flight restriction sits on or near your path. Reroute around it.";
  if (/climb/i.test(t))
    return "Climb performance at today’s density altitude is too weak for a safe departure.";
  if (/runway.*length|takeoff distance/i.test(t))
    return "The runway is too short for today’s weight and density altitude.";
  return t.replace(/^NO-GO:\s*/i, "").replace(/^\[.*?\]\s*/, "");
}

export function plainCaution(raw: string): string {
  const t = raw.trim();
  if (/TEMPO|PROB/i.test(t))
    return "The TAF includes temporary or probability weather in your window — conditions may briefly worsen.";
  if (/PIREP/i.test(t)) return "A pilot nearby reported bumps or weather worth watching.";
  if (/AIRMET|G-AIRMET/i.test(t)) return "An AIRMET is out for the area. Stay alert and have an out.";
  if (/CWA/i.test(t)) return "ATC issued a Center Weather Advisory near the route.";
  if (/cache|unavailable/i.test(t))
    return "Live weather failed to load for a station — we fell back to cached data. Double-check.";
  if (/marine|burn/i.test(t)) return "Coastal marine layer may still be a factor.";
  if (/crosswind/i.test(t)) return "Expect a noticeable crosswind on landing.";
  return t;
}

export function buildFindings(
  decision: VfrCorridorDecision,
  intel?: WeatherIntel
): BriefFinding[] {
  const findings: BriefFinding[] = [];

  decision.blockers.forEach((b, i) => {
    findings.push({
      id: `stop-${i}`,
      severity: "stop",
      title: "Hard stop",
      plain: plainBlocker(b),
      source: guessSource(b),
    });
  });

  decision.cautions.forEach((c, i) => {
    findings.push({
      id: `cau-${i}`,
      severity: "caution",
      title: "Caution",
      plain: plainCaution(c),
      source: guessSource(c),
    });
  });

  (intel?.advisories || [])
    .filter((a) => a.intersectsRoute)
    .slice(0, 10)
    .forEach((a) => {
      // Avoid duplicating if already covered by blocker text
      if (findings.some((f) => f.plain.includes(a.hazard) || f.source === a.product)) return;
      findings.push({
        id: a.id,
        severity: a.severity === "severe" ? "stop" : a.severity === "caution" ? "caution" : "info",
        title: productTitle(a),
        plain: advisoryPlain(a),
        source: a.product,
      });
    });

  (intel?.pireps || []).slice(0, 5).forEach((p) => {
    findings.push({
      id: `pirep-${p.id}`,
      severity: p.severity === "severe" ? "stop" : p.severity === "caution" ? "caution" : "info",
      title: "Pilot report",
      plain: pirepPlain(p),
      source: "PIREP",
    });
  });

  return findings;
}

function guessSource(text: string): string {
  if (/SIGMET/i.test(text)) return "SIGMET";
  if (/AIRMET|G-AIRMET/i.test(text)) return "G-AIRMET";
  if (/PIREP/i.test(text)) return "PIREP";
  if (/TFR|NOTAM/i.test(text)) return "TFR/NOTAM";
  if (/TAF|TEMPO|PROB|forecast/i.test(text)) return "TAF";
  if (/METAR|flight category|ceiling|visibility/i.test(text)) return "METAR/TAF";
  if (/fuel|weight|climb|runway/i.test(text)) return "Performance";
  if (/terrain/i.test(text)) return "Terrain";
  if (/CWA/i.test(text)) return "CWA";
  return "Rules check";
}

function productTitle(a: HazardAdvisory): string {
  if (a.product === "TFR") return "Flight restriction (TFR)";
  if (a.product === "SIGMET") return "Significant weather (SIGMET)";
  if (a.product === "G-AIRMET") return `AIRMET · ${a.hazard}`;
  if (a.product === "CWA") return "Center weather advisory";
  return a.product;
}

function advisoryPlain(a: HazardAdvisory): string {
  const what = plainHazard(a.hazard);
  if (a.product === "TFR") {
    return `${what}. ${a.summary}. Do not enter this airspace.`;
  }
  return `${what}. ${a.summary}`;
}

function pirepPlain(p: PirepReport): string {
  const bits: string[] = [];
  if (p.turbulence) bits.push(`turbulence (${p.turbulence})`);
  if (p.icing) bits.push(`icing (${p.icing})`);
  const what = bits.length ? bits.join(" and ") : "weather conditions";
  const alt = p.altitudeFt != null ? ` around ${p.altitudeFt.toLocaleString()} ft` : "";
  const age = p.ageHours <= 1 ? "in the last hour" : `about ${p.ageHours}h ago`;
  return `A pilot reported ${what}${alt} ${age}.`;
}

export function fallbackSynopsis(
  decision: VfrCorridorDecision,
  findings: BriefFinding[]
): string {
  const stops = findings.filter((f) => f.severity === "stop");
  const cautions = findings.filter((f) => f.severity === "caution");
  if (decision.verdict === "NO_GO") {
    return (
      `This flight is a NO-GO for VFR as planned. ` +
      (stops[0]
        ? `Main reason: ${stops[0].plain} `
        : "") +
      (stops.length > 1 ? `There ${stops.length === 2 ? "is one more" : `are ${stops.length - 1} more`} hard stop${stops.length > 2 ? "s" : ""}. ` : "") +
      `Review the Adverse Conditions and Charts tabs, then change altitude, time, or route before departing.`
    );
  }
  if (decision.verdict === "MARGINAL") {
    return (
      `This flight is MARGINAL. Weather and hazards do not hard-stop you, but ` +
      (cautions[0]?.plain || "several caution items need your judgment.") +
      ` Walk the Forecast and Charts sections before you go.`
    );
  }
  return (
    `This flight looks GO for VFR with the current public weather and performance checks. ` +
    `Still review TAFs valid for your departure and arrival times, plus any AIRMETs or PIREPs on the Hazards tab. You are PIC.`
  );
}

export function formatTafWindow(fromSec?: number, toSec?: number): string {
  if (!fromSec || !toSec) return "Validity unknown";
  const fmt = (s: number) =>
    new Date(s * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(fromSec)} → ${fmt(toSec)}`;
}
