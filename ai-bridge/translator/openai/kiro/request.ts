// Translates OpenAI Chat Completions format → Kiro/AWS CodeWhisperer format.
// Ported from open-sse/translator/request/openai-to-kiro.js

function generateUUID(): string {
  return crypto.randomUUID();
}

interface KiroMessage {
  userInputMessage?: {
    content: string;
    modelId: string;
    origin?: string;
    userInputMessageContext?: Record<string, unknown>;
    images?: unknown[];
  };
  assistantResponseMessage?: {
    content: string;
    toolUses?: unknown[];
  };
}

interface KiroConvertResult {
  history: KiroMessage[];
  currentMessage: KiroMessage | null;
}

function convertMessages(
  messages: Array<Record<string, unknown>>,
  tools: unknown[],
  model: string
): KiroConvertResult {
  const history: KiroMessage[] = [];
  let currentMessage: KiroMessage | null = null;

  let pendingUserContent: string[] = [];
  let pendingAssistantContent: string[] = [];
  let pendingToolResults: unknown[] = [];
  let pendingImages: unknown[] = [];
  let currentRole: string | null = null;

  const supportsImages = model && model.toLowerCase().includes("claude");

  const flushPending = () => {
    if (currentRole === "user") {
      const content = pendingUserContent.join("\n\n").trim() || "continue";
      const userMsg: KiroMessage = {
        userInputMessage: {
          content,
          modelId: "",
        },
      };

      if (pendingImages.length > 0) {
        userMsg.userInputMessage!.images = pendingImages;
      }

      if (pendingToolResults.length > 0) {
        userMsg.userInputMessage!.userInputMessageContext = {
          toolResults: pendingToolResults,
        };
      }

      if (tools.length > 0 && history.length === 0) {
        if (!userMsg.userInputMessage!.userInputMessageContext) {
          userMsg.userInputMessage!.userInputMessageContext = {};
        }
        userMsg.userInputMessage!.userInputMessageContext!.tools = tools.map((t) => {
          const tObj = t as Record<string, unknown>;
          const fn = (tObj.function as Record<string, unknown>) ?? {};
          const name = (fn.name as string) ?? (tObj.name as string) ?? "";
          let description = (fn.description as string) ?? (tObj.description as string) ?? "";
          if (!description.trim()) description = `Tool: ${name}`;
          const schema = (fn.parameters as Record<string, unknown>) ?? (tObj.parameters as Record<string, unknown>) ?? {};
          const normalizedSchema =
            Object.keys(schema).length === 0
              ? { type: "object", properties: {}, required: [] }
              : { ...schema, required: (schema.required as unknown[]) ?? [] };
          return { toolSpecification: { name, description, inputSchema: { json: normalizedSchema } } };
        });
      }

      history.push(userMsg);
      currentMessage = userMsg;
      pendingUserContent = [];
      pendingToolResults = [];
      pendingImages = [];
    } else if (currentRole === "assistant") {
      const content = pendingAssistantContent.join("\n\n").trim() || "...";
      const assistantMsg: KiroMessage = { assistantResponseMessage: { content } };
      history.push(assistantMsg);
      pendingAssistantContent = [];
    }
  };

  for (const msg of messages) {
    let role = msg.role as string;
    if (role === "system" || role === "tool") role = "user";

    if (role !== currentRole && currentRole !== null) flushPending();
    currentRole = role;

    if (role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        for (const c of msg.content as Array<Record<string, unknown>>) {
          if (c.type === "text" || c.text) {
            textParts.push((c.text as string) || "");
          } else if (supportsImages && c.type === "image_url") {
            const imgUrl = c.image_url as Record<string, unknown> | undefined;
            const url = (typeof imgUrl === "string" ? imgUrl : imgUrl?.url) as string | undefined;
            if (url) {
              const base64Match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (base64Match) {
                const mediaType = base64Match[1]!;
                const format = mediaType.split("/")[1] || mediaType;
                pendingImages.push({ format, source: { bytes: base64Match[2]! } });
              } else {
                textParts.push(`[Image: ${url}]`);
              }
            }
          } else if (supportsImages && c.type === "image") {
            const source = c.source as Record<string, unknown> | undefined;
            if (source?.type === "base64" && source.data) {
              const mediaType = (source.media_type as string) || "image/png";
              const format = mediaType.split("/")[1] || mediaType;
              pendingImages.push({ format, source: { bytes: source.data } });
            }
          }
        }
        content = textParts.join("\n");

        // tool_result blocks
        const toolResultBlocks = (msg.content as Array<Record<string, unknown>>).filter(
          (c) => c.type === "tool_result",
        );
        for (const block of toolResultBlocks) {
          const text = Array.isArray(block.content)
            ? (block.content as Array<Record<string, unknown>>).map((c) => c.text || "").join("\n")
            : typeof block.content === "string"
              ? block.content
              : "";
          pendingToolResults.push({
            toolUseId: block.tool_use_id,
            status: "success",
            content: [{ text }],
          });
        }
      }

      // Original role was "tool"
      if ((msg.role as string) === "tool") {
        const toolContent = typeof msg.content === "string" ? msg.content : "";
        pendingToolResults.push({
          toolUseId: msg.tool_call_id,
          status: "success",
          content: [{ text: toolContent }],
        });
      } else if (content) {
        pendingUserContent.push(content);
      }
    } else if (role === "assistant") {
      let textContent = "";
      let toolUses: unknown[] = [];

      if (Array.isArray(msg.content)) {
        const contentArr = msg.content as Array<Record<string, unknown>>;
        textContent = contentArr
          .filter((c) => c.type === "text")
          .map((c) => c.text as string)
          .join("\n")
          .trim();
        toolUses = contentArr.filter((c) => c.type === "tool_use");
      } else if (typeof msg.content === "string") {
        textContent = msg.content.trim();
      }

      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        toolUses = msg.tool_calls as unknown[];
      }

      if (textContent) pendingAssistantContent.push(textContent);

      if (toolUses.length > 0) {
        flushPending();
        const lastMsg = history[history.length - 1];
        if (lastMsg?.assistantResponseMessage) {
          lastMsg.assistantResponseMessage.toolUses = toolUses.map((tc) => {
            const tcObj = tc as Record<string, unknown>;
            if (tcObj.function) {
              const fn = tcObj.function as Record<string, unknown>;
              return {
                toolUseId: tcObj.id ?? generateUUID(),
                name: fn.name,
                input:
                  typeof fn.arguments === "string"
                    ? (() => { try { return JSON.parse(fn.arguments as string); } catch { return {}; } })()
                    : (fn.arguments ?? {}),
              };
            }
            return {
              toolUseId: tcObj.id ?? generateUUID(),
              name: tcObj.name,
              input: tcObj.input ?? {},
            };
          });
        }
        currentRole = null;
      }
    }
  }

  if (currentRole !== null) flushPending();

  // Pop last userInputMessage as currentMessage
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.userInputMessage) {
      currentMessage = history.splice(i, 1)[0]!;
      break;
    }
  }

  // Grab tools from first history item BEFORE cleanup
  const firstHistoryTools = (history[0]?.userInputMessage?.userInputMessageContext as Record<string, unknown> | undefined)?.tools;

  // Clean up history
  for (const item of history) {
    if (item.userInputMessage?.userInputMessageContext) {
      delete (item.userInputMessage.userInputMessageContext as Record<string, unknown>).tools;
      if (Object.keys(item.userInputMessage.userInputMessageContext).length === 0) {
        delete item.userInputMessage.userInputMessageContext;
      }
    }
    if (item.userInputMessage && !item.userInputMessage.modelId) {
      item.userInputMessage.modelId = model;
    }
  }

  // Inject tools into currentMessage
  if (firstHistoryTools && currentMessage?.userInputMessage) {
    if (!currentMessage.userInputMessage.userInputMessageContext) {
      currentMessage.userInputMessage.userInputMessageContext = {};
    }
    if (!(currentMessage.userInputMessage.userInputMessageContext as Record<string, unknown>).tools) {
      (currentMessage.userInputMessage.userInputMessageContext as Record<string, unknown>).tools = firstHistoryTools;
    }
  }

  return { history, currentMessage };
}

export function convertOpenAIRequestToKiro(
  modelName: string,
  inputRaw: Uint8Array,
  _stream: boolean,
  credentials?: Record<string, unknown>
): Uint8Array {
  const raw = JSON.parse(new TextDecoder().decode(inputRaw)) as Record<string, unknown>;

  const messages = (raw.messages as Array<Record<string, unknown>>) ?? [];
  const tools = (raw.tools as unknown[]) ?? [];
  const temperature = raw.temperature as number | undefined;
  const topP = raw.top_p as number | undefined;

  const { history, currentMessage } = convertMessages(messages, tools, modelName);

  const profileArn = (credentials?.providerSpecificData as Record<string, unknown> | undefined)?.profileArn as string | undefined ?? "";

  const timestamp = new Date().toISOString();
  let finalContent = currentMessage?.userInputMessage?.content ?? "";
  finalContent = `[Context: Current time is ${timestamp}]\n\n${finalContent}`;

  const payload: Record<string, unknown> = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: generateUUID(),
      currentMessage: {
        userInputMessage: {
          content: finalContent,
          modelId: modelName,
          origin: "AI_EDITOR",
          ...(currentMessage?.userInputMessage?.userInputMessageContext
            ? { userInputMessageContext: currentMessage.userInputMessage.userInputMessageContext }
            : {}),
        },
      },
      history,
    },
  };

  if (profileArn) payload.profileArn = profileArn;

  const inferenceConfig: Record<string, unknown> = { maxTokens: 32000 };
  if (temperature !== undefined) inferenceConfig.temperature = temperature;
  if (topP !== undefined) inferenceConfig.topP = topP;
  payload.inferenceConfig = inferenceConfig;

  return new TextEncoder().encode(JSON.stringify(payload));
}
