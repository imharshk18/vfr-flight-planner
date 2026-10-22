import { NextRequest } from "next/server";

/**
 * Proxy public NOAA chart images so the briefing can show them
 * without hotlink / CORP failures. Allowlist only.
 */

const CHARTS: Record<string, string> = {
  wind050: "https://aviationweather.gov/data/products/fax/F06_wind_050_a.gif",
  wind100: "https://aviationweather.gov/data/products/fax/F12_wind_100_a.gif",
  sigwx: "https://aviationweather.gov/data/products/fax/sigwx_lo_us.gif",
  surface: "https://www.wpc.ncep.noaa.gov/basicwx/92fndfd.gif",
  surface36: "https://www.wpc.ncep.noaa.gov/basicwx/96fndfd.gif",
  goes: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/CONUS/GEOCOLOR/latest.jpg",
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  const url = CHARTS[id];
  if (!url) {
    return Response.json({ error: "Unknown chart" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      headers: { "User-Agent": "AeroTwin/1.0 (VFR briefing rehearsal)" },
    });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const bytes = await upstream.arrayBuffer();
    const type = upstream.headers.get("content-type") || "image/gif";
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return Response.json({ error: "Chart unavailable" }, { status: 502 });
  }
}
