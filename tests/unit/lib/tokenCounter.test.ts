import { describe, it, expect } from "bun:test";
import {
  countTokens,
  extractPromptText,
  extractCompletionText,
} from "../../../lib/tokenCounter.ts";

describe("tokenCounter", () => {
  describe("countTokens", () => {
    it("should return 0 for empty string", () => {
      expect(countTokens("")).toBe(0);
    });

    it("should return 0 for whitespace-only string", () => {
      expect(countTokens("   ")).toBe(0);
    });

    it("should estimate tokens for a short English text", () => {
      const text = "Hello, world!";
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(20);
    });

    it("should estimate tokens for a longer text", () => {
      const text = "The quick brown fox jumps over the lazy dog.";
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(30);
    });

    it("should accept an optional model parameter", () => {
      // tokenx doesn't vary by model, but the API accepts it for future compatibility
      expect(countTokens("hello", "gpt-4o")).toBeGreaterThan(0);
    });
  });

  describe("extractPromptText", () => {
    it("should extract text from OpenAI-style messages with string content", () => {
      const body = {
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello!" },
        ],
      };
      const text = extractPromptText(body);
      expect(text).toContain("You are helpful.");
      expect(text).toContain("Hello!");
    });

    it("should extract text from OpenAI-style messages with array content blocks", () => {
      const body = {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What is this?" },
              { type: "image_url", image_url: { url: "http://example.com/img.png" } },
            ],
          },
        ],
      };
      const text = extractPromptText(body);
      expect(text).toBe("What is this?");
    });

    it("should extract text from Anthropic-style input array", () => {
      const body = {
        input: [
          { role: "user", text: "Hello there." },
          { role: "assistant", text: "Hi!" },
        ],
      };
      const text = extractPromptText(body);
      expect(text).toContain("Hello there.");
      expect(text).toContain("Hi!");
    });

    it("should extract text from plain prompt string", () => {
      const body = { prompt: "Translate to French." };
      const text = extractPromptText(body);
      expect(text).toBe("Translate to French.");
    });

    it("should return empty string for empty body", () => {
      expect(extractPromptText({})).toBe("");
    });

    it("should handle mixed content types", () => {
      const body = {
        messages: [
          { role: "system", content: "System prompt." },
          { role: "user", content: [{ type: "text", text: "User question." }] },
        ],
      };
      const text = extractPromptText(body);
      expect(text).toContain("System prompt.");
      expect(text).toContain("User question.");
    });
  });

  describe("extractCompletionText", () => {
    it("should extract text from OpenAI-style choices[0].message.content", () => {
      const parsed = {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "The answer is 42." },
          },
        ],
      };
      const text = extractCompletionText(parsed);
      expect(text).toBe("The answer is 42.");
    });

    it("should extract text from Anthropic-style content[0].text", () => {
      const parsed = {
        content: [{ type: "text", text: "Here is the result." }],
      };
      const text = extractCompletionText(parsed);
      expect(text).toBe("Here is the result.");
    });

    it("should extract text from plain completion string", () => {
      const parsed = { completion: "Done." };
      const text = extractCompletionText(parsed);
      expect(text).toBe("Done.");
    });

    it("should extract text from output array", () => {
      const parsed = {
        output: [{ text: "Result 1" }, { text: "Result 2" }],
      };
      const text = extractCompletionText(parsed);
      expect(text).toContain("Result 1");
      expect(text).toContain("Result 2");
    });

    it("should extract text from choices[0].delta.content", () => {
      const parsed = {
        choices: [{ delta: { content: "Delta content." } }],
      };
      const text = extractCompletionText(parsed);
      expect(text).toBe("Delta content.");
    });

    it("should return empty string for empty response", () => {
      expect(extractCompletionText({})).toBe("");
    });
  });
});
