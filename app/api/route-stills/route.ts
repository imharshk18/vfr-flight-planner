import { NextResponse } from "next/server";

/**
 * Optional Gemini stills for pilot-eye landmark / approach cards.
 * Does NOT replace the interactive 3D mesh.
 *
 * Set GEMINI_API_KEY in .env.local (server-only, never NEXT_PUBLIC).
 */

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_key",
        message: "Add GEMINI_API_KEY to .env.local to generate route stills.",
      },
      { status: 501 }
    );
  }

  let body: {
    origin?: string;
    destination?: string;
    landmark?: string;
    cue?: string;
    verdict?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  const origin = (body.origin || "DEP").toUpperCase();
  const destination = (body.destination || "ARR").toUpperCase();
  const landmark = body.landmark || "coastal ridge";
  const cue = body.cue || "VFR day visual reference";
  const prompt =
    `Ultra photorealistic general aviation cockpit / approach visualization, editorial aviation magazine style, ` +
    `shot from pilot eye looking ahead on a VFR day, 24mm lens, 16:9. ` +
    `Route ${origin} to ${destination}. Feature this visual cue: ${landmark}. ${cue}. ` +
    `Soft contact shadows, cinematic light falloff, subtle film grain, extremely detailed materials. ` +
    `No UI chrome, no watermarks, no fake HUD text. Realistic California light when applicable.`;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `gemini-2.0-flash-preview-image-generation:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          ok: false,
          reason: "upstream",
          message: "Gemini image generation failed.",
          detail: errText.slice(0, 400),
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data
    );
    if (!imagePart?.inlineData?.data) {
      return NextResponse.json(
        {
          ok: false,
          reason: "no_image",
          message: "Gemini returned no image. Your model tier may not support image generation.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      mimeType: imagePart.inlineData.mimeType || "image/png",
      data: imagePart.inlineData.data,
      prompt,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        reason: "error",
        message: e instanceof Error ? e.message : "Stills request failed",
      },
      { status: 500 }
    );
  }
}
