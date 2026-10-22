import { NextResponse } from "next/server";

/**
 * Gemini plain-English VFR briefing synopsis.
 * Uses GEMINI_API_KEY (server-only). Falls back gracefully if unavailable.
 */

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  let body: {
    origin?: string;
    destination?: string;
    verdict?: string;
    findings?: Array<{ severity: string; plain: string; source: string }>;
    depCategory?: string;
    arrCategory?: string;
    cruiseFt?: number;
    eteMin?: number;
    depLocal?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const findings = (body.findings || []).slice(0, 12);
  const bulletList = findings
    .map((f) => `- [${f.severity}/${f.source}] ${f.plain}`)
    .join("\n");

  const fallback =
    body.verdict === "NO_GO"
      ? `NO-GO for VFR ${body.origin}→${body.destination}. Address the hard stops below before departing.`
      : body.verdict === "MARGINAL"
      ? `MARGINAL VFR ${body.origin}→${body.destination}. Review cautions and forecast windows carefully.`
      : `GO for VFR ${body.origin}→${body.destination} based on the public products checked. You remain PIC.`;

  if (!key) {
    return NextResponse.json({ ok: true, synopsis: fallback, source: "local" });
  }

  const prompt =
    `You are a calm flight instructor writing a ForeFlight-style standard briefing synopsis for a VFR day flight.\n` +
    `Use short plain English a student pilot understands. No jargon dumps. No markdown headings.\n` +
    `2-4 sentences max. Start with GO, MARGINAL, or NO-GO.\n` +
    `Route: ${body.origin} to ${body.destination}. Cruise ${body.cruiseFt || "?"} ft. ETE ~${body.eteMin || "?"} min.\n` +
    `Departure time: ${body.depLocal || "now"}. Dep category ${body.depCategory}, arr category ${body.arrCategory}.\n` +
    `Engine verdict: ${body.verdict}.\n` +
    `Findings:\n${bulletList || "(none)"}\n` +
    `Do not invent weather. Only restate and prioritize the findings. End by reminding the pilot they are PIC.`;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 280 },
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: true, synopsis: fallback, source: "local" });
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || fallback;

    return NextResponse.json({
      ok: true,
      synopsis: text.slice(0, 900),
      source: "gemini",
    });
  } catch {
    return NextResponse.json({ ok: true, synopsis: fallback, source: "local" });
  }
}
