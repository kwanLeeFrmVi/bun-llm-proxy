import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-cdd81757bd47412c90af3b5e43ad9682",
  baseURL: "http://localhost:20129/v1",
});

// Test non-streaming (matching user's client code pattern)
try {
  console.log("=== Non-streaming (no stream param) ===");
  const resp = await client.chat.completions.create({
    model: "ollama/minimax-m2.7",
    messages: [{ role: "user", content: "write a commit message for fixing a typo" }],
    temperature: 0,
    max_tokens: 500,
  });
  console.log("OK:", JSON.stringify(resp.choices[0]?.message?.content)?.slice(0, 100));
} catch (e: any) {
  console.error("FAIL:", e.message);
  console.error("Status:", e.status);
  console.error("Headers:", JSON.stringify(e.headers));
  // Try to read the raw response
  if (e.error) console.error("Error body:", JSON.stringify(e.error));
}

// Test streaming
try {
  console.log("\n=== Streaming ===");
  const stream = await client.chat.completions.create({
    model: "ollama/minimax-m2.7",
    messages: [{ role: "user", content: "write a commit message for fixing a typo" }],
    stream: true,
    temperature: 0,
    max_tokens: 500,
  });
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) process.stdout.write(content);
  }
  console.log("\nOK");
} catch (e: any) {
  console.error("\nFAIL:", e.message);
  console.error("Status:", e.status);
}
