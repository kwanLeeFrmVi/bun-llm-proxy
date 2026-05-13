import { estimateTokenCount } from "tokenx";

/**
 * Count tokens in a text string using tokenx heuristic estimation.
 *
 * tokenx provides ~96% accuracy compared to full tokenizers with zero
 * dependencies and a tiny bundle. We use it as a fallback when upstream
 * providers don't send token counts.
 */
export function countTokens(text: string, _model?: string): number {
  if (!text || text.length === 0) return 0;
  return estimateTokenCount(text);
}

/**
 * Extract the full prompt text from a request body.
 *
 * Handles:
 *   - OpenAI-style `messages` array (string or array content blocks)
 *   - Anthropic-style `input` array
 *   - Plain string `prompt`
 */
export function extractPromptText(body: Record<string, unknown>): string {
  const parts: string[] = [];

  const messages = body.messages as unknown[] | undefined;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (msg && typeof msg === "object") {
        const content = (msg as Record<string, unknown>).content;
        parts.push(extractContentText(content));
      }
    }
  }

  const input = body.input as unknown[] | undefined;
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const content =
          (item as Record<string, unknown>).text ?? (item as Record<string, unknown>).content;
        parts.push(extractContentText(content));
      }
    }
  }

  const prompt = body.prompt;
  if (typeof prompt === "string") {
    parts.push(prompt);
  }

  return parts.join("\n");
}

/**
 * Extract completion/response text from a parsed non-streaming response.
 *
 * Handles:
 *   - OpenAI-style `choices[0].message.content`
 *   - Anthropic-style `content[0].text`
 *   - Plain string `completion`
 *   - `output` array
 */
export function extractCompletionText(parsed: Record<string, unknown>): string {
  const parts: string[] = [];

  const choices = parsed.choices as unknown[] | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    if (firstChoice) {
      const message = firstChoice.message as Record<string, unknown> | undefined;
      if (message) {
        parts.push(extractContentText(message.content));
      }
      // OpenAI-compatible delta (used in some aggregated responses)
      const delta = firstChoice.delta as Record<string, unknown> | undefined;
      if (delta) {
        parts.push(extractContentText(delta.content));
      }
    }
  }

  const content = parsed.content as unknown[] | undefined;
  if (Array.isArray(content) && content.length > 0) {
    const firstBlock = content[0] as Record<string, unknown> | undefined;
    if (firstBlock) {
      parts.push(extractContentText(firstBlock.text));
    }
  }

  const completion = parsed.completion;
  if (typeof completion === "string") {
    parts.push(completion);
  }

  const output = parsed.output;
  if (typeof output === "string") {
    parts.push(output);
  } else if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === "object") {
        parts.push(extractContentText((item as Record<string, unknown>).text));
      }
    }
  }

  return parts.join("\n");
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        texts.push(block);
      } else if (block && typeof block === "object") {
        const type = (block as Record<string, unknown>).type;
        if (type === "text" || type === "text_delta") {
          const text = (block as Record<string, unknown>).text;
          if (typeof text === "string") {
            texts.push(text);
          }
        }
        // OpenAI image_url / other content blocks — skip (no tokens)
      }
    }
    return texts.join("");
  }
  return "";
}
