export type GeneratedCard = {
  id: string;
  heading: string;
  content: string;
};

export type StreamStartEvent = {
  type: "start";
  cards: GeneratedCard[];
};

export type StreamChunkEvent = {
  type: "chunk";
  id: string;
  contentChunk: string;
};

export type StreamDoneEvent = {
  type: "done";
};

export type StreamErrorEvent = {
  type: "error";
  error: string;
};

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

  return parsed.outputs.map((item, index) => {
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
  const apiKey = process.env.FRENIX_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FRENIX_API_KEY environment variable");
  }

  const response = await fetch("https://api.frenix.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "glm-5",
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
  const apiKey = process.env.CEREBRAS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing CEREBRAS_API_KEY environment variable");
  }

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
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

export async function fetchGeneratedContent(prompt: string): Promise<GeneratedCard[]> {
  const provider = process.env.AI_PROVIDER ?? "cerebras";

  if (provider === "frenix") {
    return fetchFrenixContent(prompt);
  }

  return fetchCerebrasContent(prompt);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkTextSmoothly(content: string) {
  const chunks: string[] = [];
  let index = 0;

  while (index < content.length) {
    const current = content[index];

    if (!current) {
      break;
    }

    if (/\s/.test(current) || /[.,!?;:]/.test(current)) {
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
