import {
  chunkTextSmoothly,
  fetchGeneratedContent,
  sleep,
  type GenerationMode,
  type StreamChunkEvent,
  type StreamDoneEvent,
  type StreamErrorEvent,
  type StreamStartEvent
} from "@/lib/content-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

function toNdjson(payload: StreamStartEvent | StreamChunkEvent | StreamDoneEvent | StreamErrorEvent) {
  return `${JSON.stringify(payload)}\n`;
}

export async function POST(request: Request) {
  let prompt = "";
  let mode: GenerationMode = "blog";

  try {
    const body = (await request.json()) as { prompt?: string; mode?: GenerationMode };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    mode = body.mode === "description" ? "description" : "blog";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!prompt) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const outputs = await fetchGeneratedContent(prompt, mode);
        const cards = outputs.map((card) => ({ ...card, content: "" }));
        controller.enqueue(encoder.encode(toNdjson({ type: "start", cards })));

        const queues = outputs.map((card) => ({
          id: card.id,
          chunks: chunkTextSmoothly(card.content)
        }));

        let hasRemaining = true;

        while (hasRemaining) {
          hasRemaining = false;

          for (const queue of queues) {
            const nextChunk = queue.chunks.shift();

            if (!nextChunk) {
              continue;
            }

            hasRemaining = true;
            controller.enqueue(
              encoder.encode(
                toNdjson({
                  type: "chunk",
                  id: queue.id,
                  contentChunk: nextChunk
                })
              )
            );
          }

          if (hasRemaining) {
            await sleep(137);
          }
        }

        controller.enqueue(encoder.encode(toNdjson({ type: "done" })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate content.";
        controller.enqueue(encoder.encode(toNdjson({ type: "error", error: message })));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
