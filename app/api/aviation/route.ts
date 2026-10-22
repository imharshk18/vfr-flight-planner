import type { NextRequest } from "next/server";

/**
 * Proxy to NOAA Aviation Weather Center public APIs.
 * Allowlisted products only. No auth required upstream.
 */

const STATION_KINDS = new Set(["metar", "taf", "airport"]);
const AREA_KINDS = new Set(["pirep", "gairmet", "airsigmet", "cwa"]);

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") || "metar";
  const ids = (request.nextUrl.searchParams.get("ids") || "").toUpperCase();
  const bbox = request.nextUrl.searchParams.get("bbox") || "";
  const distance = request.nextUrl.searchParams.get("distance") || "75";
  const age = request.nextUrl.searchParams.get("age") || "6";
  const level = request.nextUrl.searchParams.get("level") || "";

  if (!STATION_KINDS.has(kind) && !AREA_KINDS.has(kind)) {
    return Response.json({ error: "Unsupported aviation product" }, { status: 400 });
  }

  try {
    const url = new URL(`https://aviationweather.gov/api/data/${kind}`);
    url.searchParams.set("format", "json");

    if (STATION_KINDS.has(kind)) {
      if (!/^[A-Z0-9]{3,4}$/.test(ids)) {
        return Response.json({ error: "Invalid station id" }, { status: 400 });
      }
      url.searchParams.set("ids", ids);
    } else if (kind === "pirep") {
      if (ids && /^[A-Z0-9]{3,4}$/.test(ids)) {
        url.searchParams.set("id", ids);
        url.searchParams.set("distance", distance);
      } else if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(bbox)) {
        url.searchParams.set("bbox", bbox);
      } else {
        return Response.json({ error: "PIREP needs id or bbox" }, { status: 400 });
      }
      url.searchParams.set("age", age);
      if (level) url.searchParams.set("level", level);
    } else {
      // gairmet / airsigmet / cwa: optional bbox filter
      if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(bbox)) {
        url.searchParams.set("bbox", bbox);
      }
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    const body = await response.text();
    return Response.json(body ? JSON.parse(body) : []);
  } catch {
    return Response.json({ error: "Aviation weather service unavailable" }, { status: 502 });
  }
}
