import cors from "cors";
import express from "express";

type GeneratedCard = {
  id: string;
  heading: string;
  content: string;
};

type StreamStartEvent = {
  type: "start";
  cards: GeneratedCard[];
};

type StreamChunkEvent = {
  type: "chunk";
  id: string;
  contentChunk: string;
};

type StreamDoneEvent = {
  type: "done";
};

type StreamErrorEvent = {
  type: "error";
  error: string;
};

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  process.env.CLIENT_ORIGIN
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeStreamEvent(
  response: express.Response,
  payload: StreamStartEvent | StreamChunkEvent | StreamDoneEvent | StreamErrorEvent
) {
  response.write(`${JSON.stringify(payload)}\n`);
}

const ACTIVE_PROVIDER = "cerebras";
const FRENIX_API_KEY = "sk-frenix-232739e5f5604123a8271ebec6e806aa";
const CEREBRAS_API_KEY = "csk-m5mk5hwmrcy8xnfc4t9jvdkv2thcm3hxk6kv84mecf5849mn";

const systemPrompt = `You are an expert AI content generation assistant.

The user will provide a topic, keyword, product, idea, or prompt.

Generate exactly 6 unique, high-quality content variations based on the user's request.

Your goal is to create outputs that are:

* Creative and original
* Practical and useful
* Engaging and easy to understand
* Distinct from one another
* Relevant to the user's input and intent

Each output must contain:

* A short, compelling heading (2-8 words)
* A substantial content section (8-14 sentences, roughly 140-220 words)

The content should:

* Provide real value instead of generic filler
* Include examples, insights, benefits, angles, or actionable ideas where appropriate
* Feel rich, complete, and visually full inside a tall content card
* Avoid ending too early or giving only a brief summary
* Expand ideas with detail, specificity, and flow
* Vary in tone, perspective, and approach across all 6 outputs

Adapt automatically based on the user's request:

* Blog Ideas -> Generate different article concepts and angles
* Blog Titles -> Generate strong title variations
* Product Descriptions -> Highlight different benefits, use cases, and selling points
* Social Media Captions -> Create engaging captions with varied styles
* Marketing Content -> Focus on persuasion, benefits, and audience appeal
* General Content -> Produce relevant content variations matching the prompt

Return ONLY valid JSON.

Response format:

{
  "outputs": [
    {
      "heading": "Title Here",
      "content": "Detailed content here..."
    }
  ]
}

Rules:

* Return exactly 6 objects inside "outputs"
* No markdown
* No code blocks
* No explanations
* No additional text outside the JSON
* Ensure all JSON is valid and properly escaped
* Never return fewer or more than 6 outputs
* Make every output meaningfully different from the others`;

function parseGeneratedCards(contentString: string, providerName: string): GeneratedCard[] {
  let cleanJson = contentString.trim();

  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }

  const parsed = JSON.parse(cleanJson) as { outputs?: Array<{ heading?: string; content?: string }> };
  if (!parsed.outputs || !Array.isArray(parsed.outputs)) {
    throw new Error(`Invalid ${providerName} response format: outputs array is missing`);
  }

  return parsed.outputs.map((item: any, index: number) => {
    const heading = String(item.heading || `Idea ${index + 1}`);
    const content = String(item.content || "");
    const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return {
      id: `${index + 1}-${slug}`,
      heading,
      content
    };
  });
}

async function fetchFrenixContent(prompt: string): Promise<GeneratedCard[]> {
  const model = "glm-5";

  const response = await fetch("https://api.frenix.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${FRENIX_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Frenix API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const contentString = result.choices?.[0]?.message?.content;
  if (!contentString) {
    throw new Error("Empty response from Frenix API");
  }

  return parseGeneratedCards(contentString, "Frenix");
}

async function fetchCerebrasContent(prompt: string): Promise<GeneratedCard[]> {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CEREBRAS_API_KEY}`
    },
    body: JSON.stringify({
      model: "zai-glm-4.7",
      stream: false,
      max_tokens: 65000,
      temperature: 1,
      top_p: 0.95,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${errorText}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const contentString = result.choices?.[0]?.message?.content;
  if (!contentString) {
    throw new Error("Empty response from Cerebras API");
  }

  return parseGeneratedCards(contentString, "Cerebras");
}

async function fetchGeneratedContent(prompt: string): Promise<GeneratedCard[]> {
  if (ACTIVE_PROVIDER === "cerebras") {
    return fetchCerebrasContent(prompt);
  }

  return fetchFrenixContent(prompt);
}

app.post("/api/generate", async (request, response) => {
  const prompt = typeof request.body?.prompt === "string" ? request.body.prompt.trim() : "";

  if (!prompt) {
    response.status(400).json({ error: "Prompt is required." });
    return;
  }

  try {
    const outputs = await fetchGeneratedContent(prompt);
    response.json({ outputs });
  } catch (error: any) {
    console.error("Content generation error:", error);
    response.status(500).json({ error: error.message || "Failed to generate content." });
  }
});

app.post("/api/generate/stream", async (request, response) => {
  const prompt = typeof request.body?.prompt === "string" ? request.body.prompt.trim() : "";

  if (!prompt) {
    response.status(400).json({ error: "Prompt is required." });
    return;
  }

  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  try {
    const outputs = await fetchGeneratedContent(prompt);
    const cards = outputs.map((card) => ({ ...card, content: "" }));
    writeStreamEvent(response, { type: "start", cards });

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
        writeStreamEvent(response, {
          type: "chunk",
          id: queue.id,
          contentChunk: nextChunk
        });
      }

      if (hasRemaining) {
        await sleep(137);
      }
    }

    writeStreamEvent(response, { type: "done" });
    response.end();
  } catch (error: any) {
    console.error("Streaming content generation error:", error);
    writeStreamEvent(response, {
      type: "error",
      error: error.message || "Failed to generate content."
    });
    response.end();
  }
});

function chunkTextSmoothly(content: string) {
  const chunks: string[] = [];
  let index = 0;

  while (index < content.length) {
    const current = content[index];

    if (!current) {
      break;
    }

    if (/\s/.test(current)) {
      chunks.push(current);
      index += 1;
      continue;
    }

    if (/[.,!?;:]/.test(current)) {
      chunks.push(current);
      index += 1;
      continue;
    }

    const remaining = content.length - index;
    const nextSliceLength = Math.min(remaining, pickChunkSize(index));
    const slice = content.slice(index, index + nextSliceLength);
    chunks.push(slice);
    index += nextSliceLength;
  }

  return mergeTinyChunks(chunks);
}

function pickChunkSize(index: number) {
  const cycle = index % 6;

  if (cycle === 0 || cycle === 3) {
    return 2;
  }

  if (cycle === 1 || cycle === 4) {
    return 3;
  }

  return 4;
}

function mergeTinyChunks(chunks: string[]) {
  const merged: string[] = [];

  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      !/\s/.test(chunk) &&
      !/[.,!?;:]/.test(chunk) &&
      previous.length === 1 &&
      /[a-z0-9]/i.test(previous)
    ) {
      merged[merged.length - 1] = `${previous}${chunk}`;
      continue;
    }

    merged.push(chunk);
  }

  return merged;
}

app.listen(port, () => {
  console.log(`Express API running at http://127.0.0.1:${port}`);
});
