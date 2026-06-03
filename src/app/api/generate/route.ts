import { NextResponse } from "next/server";
import { fetchGeneratedContent, type GenerationMode } from "@/lib/content-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string; mode?: GenerationMode };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const mode = body.mode === "description" ? "description" : "blog";

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const outputs = await fetchGeneratedContent(prompt, mode);
    return NextResponse.json({ outputs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate content.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
