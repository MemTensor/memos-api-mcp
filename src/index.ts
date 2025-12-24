import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Md5 } from "ts-md5"
import dayjs from "dayjs"
import { readFileSync } from "node:fs"
import * as https from "node:https"
import { URL } from "node:url"

/**
 * 将字符串转换为MD5加密后的32位小写密文
 * @param input 要加密的字符串
 * @returns 32位小写MD5加密结果
 */
function stringToMd5(input: string): string {
  return Md5.hashStr(input);
}

function generateChatTime(): string {
  return dayjs().format("YYYY-MM-DD HH:mm:ss.SSS");
}

function getPackageVersion(): string {
  const npmScriptVersion = process.env.npm_package_version
  if (npmScriptVersion) {
    return npmScriptVersion
  }

  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url)
    const raw = readFileSync(packageJsonUrl, "utf8")
    const parsed = JSON.parse(raw) as { version?: string }
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version
    }
  } catch {
    // ignore
  }

  return "0.0.0"
}

const VERSION = getPackageVersion()

const MEMOS_BASE_URL = process.env.MEMOS_BASE_URL || "https://memos.memtensor.cn/api/openmem/v1";
const MEMOS_USER_ID = process.env.MEMOS_USER_ID ?? "<unset>";
const MEMOS_CHANNEL_ID = process.env.MEMOS_CHANNEL?.toUpperCase() ?? "MEMOS";
const USER_LITERAL = JSON.stringify(MEMOS_USER_ID);
const candidateChannelId: string[] = ["MODELSCOPE", "MCPSO", "MCPMARKETCN", "MCPMARKETCOM", "MEMOS"];

const server = new McpServer(
  {
    name: "memos-api-mcp",
    version: VERSION
  },
  {
    capabilities: {
      tools: {},
      prompts: {
        "usage-guide": {
          description: "Memorization and retrieval tools usage guide",
          parameters: z.object({}),
          handler: async () => {
            return {
              content: [{
                type: "text",
                text: `# 🧠 MemOS Automatic Memory System — Mandatory Usage

## ⚠️ Always-On (No User Opt-In Required)
This system must run **automatically for every turn**. Do **not** wait for the user to say “use memory”, “use MCP”, or “call a tool”. The **client/orchestrator is responsible** for auto-invoking the tools.

## 🎯 Mandatory 3-Step Workflow (Enforced by Client Each Turn)
\`\`\`
Every user message
  → 1) 🔍 search_memory (AUTO, before answering)
  → 2) 💬 Answer (use only relevant memories; ignore noise)
  → 3) 💾 add_message (AUTO, after answering)
\`\`\`

### 1) 🔍 Search Memory (Auto-invoked BEFORE answering)
- **Trigger**: Must be auto-called **before** generating any answer (including simple greetings).
- **Tool**: \`search_memory\`
- **Parameters**:
  - \`query\`: Current user message (concise summary allowed)
  - \`conversation_first_message\`: First user message in the thread (used to generate conversation_id)
  - \`memory_limit_number\`: default 6

**Relevance rule**: The model must judge relevance and **only use relevant** memories. If results are irrelevant or noisy, **ignore them** and proceed.

### 2) 💬 Answer
Use retrieved memories **only if relevant**. If none are relevant, answer normally.

### 3) 💾 Save Conversation (Auto-invoked AFTER answering)
- **Trigger**: Must be auto-called after producing the final answer on **every turn**.
- **Tool**: \`add_message\`
- **Purpose**: PRIMARY tool for recording **NEW facts/information** and persisting conversation history for future personalization.
- **Rule**: If the user provides new information or wants to "remember" something new, use this. Do NOT use \`add_feedback\` for new additions.

### 4) 🔄 Update/Correct/Delete Memory (User-triggered ONLY)
- **Tool**: \`add_feedback\`
- **Trigger**: User requests to **modify, update, correct, or delete (without ID)** a memory.
- **Rule**: Never use this for adding new information.

## ✅ Non-Negotiable Client Responsibilities
1. **Auto-invoke** \`search_memory\` before **every** answer and \`add_message\` after **every** answer.
2. **No user opt-in**: Do not wait for the user to explicitly mention memory/tools/MCP.
3. **Stable \`conversation_first_message\`** across the thread.
4. **Store both user and assistant** messages every turn.
5. **Sequence**: Search → Answer → Save.
6. **Correct Tool Choice**: Use \`add_message\` for ALL new content (adding facts). Use \`add_feedback\` ONLY for updates, corrections, or refinements of existing memories.

## Example (pseudo-flow)
\`\`\`javascript
// User: "What's the weather today?"

// Client auto-invokes search (ALWAYS)
search_memory({ query: "What's the weather today?", conversation_first_message: "What's the weather today?", memory_limit_number: 6 })
// → returns candidate memories (maybe none)

// Model answers using only relevant items (or none)

// Client auto-invokes save (ALWAYS)
add_message({
  conversation_first_message: "What's the weather today?",
  messages: [
    { role: "user", content: "What's the weather today?" },
    { role: "assistant", content: "[Your complete response]" }
  ]
})
\`\`\`
`
              }]
            }
          }
        }
      }
    }
  }
)

async function queryMemos(path: string, body: Record<string, any>, apiKey: string) {
  const payload = JSON.stringify({ ...body, source: "MCP" });
  const url = `${MEMOS_BASE_URL}${path}`;

  const gf = (globalThis as any).fetch;
  let f: any = gf;

  if (f) {
    const res = await f(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${apiKey}`
      },
      body: payload
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
    }
    return res.json();
  }

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const options: https.RequestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${apiKey}`,
          "Content-Length": Buffer.byteLength(payload)
        }
      };
      const req = https.request(u, options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          const sc = res.statusCode || 0;
          if (sc >= 200 && sc < 300) {
            try {
              resolve(JSON.parse(txt));
            } catch {
              resolve(txt);
            }
          } else {
            reject(new Error(`HTTP ${sc} ${res.statusMessage || ""}: ${txt}`));
          }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

server.tool(
  "add_message",
  `
  Trigger: 
    1. AUTO-INVOKED: After every answer to save dialogue history.
    2. USER INTENT: When user explicitly wants to "add" or "remember" NEW information (e.g., "Add a memory...", "Remember that...", "New memory...").
  Purpose: Save dialogue history (REQUIRED) and record NEW memories.
  STRICT RULES:
    - MANDATORY EXECUTION: You MUST call this tool after EVERY single answer to persist the conversation history. This is NOT optional.
    - ALWAYS use this tool for NEW memories.
    - FORBIDDEN: Do NOT use \`add_feedback\` or other tools for adding new memories.
    - FORBIDDEN: Do NOT use this tool to modify/update existing memories.
    - CRITICAL: NEVER use this tool as part of a modification workaround (e.g. "delete old + add new"). If a modification fails, just report the failure.
  Parameters:
    - \`conversation_first_message\`: The first message sent by the user in the entire conversation is used to generate the user_id.
    - \`messages\`: Array containing BOTH:
      1. \`{ role: "user", content: "user's question or new info" }\`
      2. \`{ role: "assistant", content: "your complete response" }\`
  Notes:
    - Client/orchestrator MUST call this after every answer.
  `,
  {
    conversation_first_message: z.string().describe(
      `The first message sent by the user in the entire conversation thread. Used to generate the conversation_id.`
    ),
    messages: z.array(z.object({
      role: z.string().describe("Role of the message sender, e.g., user, assistant"),
      content: z.string().describe("Message content"),
      chat_time: z.string().optional().describe("Message chat time")
    })).describe("Array of messages containing role and content information")
  },
  async ({ conversation_first_message, messages }: { conversation_first_message: string, messages: { role: string, content: string, chat_time?: string }[] }) => {
    try {
      if (!process.env.MEMOS_API_KEY) {
        throw new Error("MEMOS_API_KEY is not set, please set it in the environment variables or mcp.json file");
      }

      if (!process.env.MEMOS_USER_ID) {
        throw new Error("MEMOS_USER_ID is not set, please set it in the environment variables or mcp.json file");
      }

      if (!candidateChannelId.includes(MEMOS_CHANNEL_ID)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL_ID);
      }

      // If no conversation_id provided, fall back to environment variable
      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;
      const actualUserId = MEMOS_CHANNEL_ID === "MEMOS" ? process.env.MEMOS_USER_ID : process.env.MEMOS_USER_ID + "-" + MEMOS_CHANNEL_ID;

      const newMessages = messages.map(message => ({
        role: message.role,
        content: message.content,
        chat_time: message.chat_time || generateChatTime()
      }));

      const data = await queryMemos(
        "/add/message",
        { 
          user_id: actualUserId, 
          conversation_id: actualConversationId, 
          messages: newMessages 
        },
        process.env.MEMOS_API_KEY
      );

      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };

    } catch (e) {
      return {
        content: [{
          type: "text",
          text: `Error: ${e instanceof Error ? e.message : "Unknown error"}`
        }],
        isError: true
      };
    }
  }
)

server.tool(
  "search_memory",
  `
  Trigger: MUST be auto-invoked by the client before generating every answer (including greetings like "hello"). Do not wait for the user to request memory/MCP/tool usage.
  Purpose: MemOS retrieval API. Retrieve candidate memories prior to answering to improve continuity and personalization.
  Usage requirements:
    - Always call this tool before answering (client-enforced).
    - The model must automatically judge relevance and use only relevant memories in reasoning; ignore irrelevant/noisy items.
  Parameters:
    - \`query\`: User's current question/message
    - \`conversation_first_message\`: First user message in the thread (used to generate conversation_id)
    - \`memory_limit_number\`: Maximum number of results to return, defaults to 6
  Notes:
    - Run before answering. Results may include noise; filter and use only what is relevant.
    - \`query\` should be a concise summary of the current user message.
    - Prefer recent and important memories. If none are relevant, proceed to answer normally.
  `,
  {
    query: z.string().describe("Search query to find relevant content in conversation history"),
    conversation_first_message: z.string().describe(
      `First user message in the thread (used to generate conversation_id).`
    ),
    memory_limit_number: z.number().describe("Maximum number of results to return, defaults to 6")
  },
  async ({ query, conversation_first_message, memory_limit_number }: { query: string, conversation_first_message: string, memory_limit_number: number | undefined }) => {
    try {

      if (!process.env.MEMOS_API_KEY) {
        throw new Error("MEMOS_API_KEY is not set, please set it in the environment variables or mcp.json file");
      }

      if (!process.env.MEMOS_USER_ID) {
        throw new Error("MEMOS_USER_ID is not set, please set it in the environment variables or mcp.json file");
      }

      if (!candidateChannelId.includes(MEMOS_CHANNEL_ID)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL_ID);
      }

      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;
      const actualUserId = MEMOS_CHANNEL_ID === "MEMOS" ? process.env.MEMOS_USER_ID : process.env.MEMOS_USER_ID + "-" + MEMOS_CHANNEL_ID;

      const data = await queryMemos(
        "/search/memory",
        {
          query,
          user_id: actualUserId,
          conversation_id: actualConversationId,
          memory_limit_number: memory_limit_number || 6
        },
        process.env.MEMOS_API_KEY
      );

      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : "Unknown error"}` }],
        isError: true
      };
    }
  }
)


server.tool(
  "delete_memory",
  `
  Trigger: User provides specific ID(s) to delete.
  Purpose: Delete memories by ID.
  STRICT RULES:
    1. BATCHING: If multiple IDs are provided, call this tool ONCE with all IDs.
    2. FORBIDDEN: Do NOT call multiple times. Do NOT enter search-delete loops.
    3. FORBIDDEN: Do not use this tool if no ID is provided (use add_feedback instead).
    4. CRITICAL: NEVER use this tool to "simulate" a modification (delete old + add new). This is strictly forbidden.
    5. CRITICAL: ONLY use if user explicitly asks to delete AND provides IDs.
  Parameters:
    - \`memory_ids\`: List of memory IDs to delete.
  `,
  {
    memory_ids: z.array(z.string()).describe("List of memory IDs to delete")
  },
  async ({ memory_ids }: { memory_ids: string[] }) => {
    try {
      if (!process.env.MEMOS_API_KEY) {
        throw new Error("MEMOS_API_KEY is not set, please set it in the environment variables or mcp.json file");
      }

      if (!process.env.MEMOS_USER_ID) {
        throw new Error("MEMOS_USER_ID is not set, please set it in the environment variables or mcp.json file");
      }

      if (!candidateChannelId.includes(MEMOS_CHANNEL_ID)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL_ID);
      }

      const actualUserId = MEMOS_CHANNEL_ID === "MEMOS" ? process.env.MEMOS_USER_ID : process.env.MEMOS_USER_ID + "-" + MEMOS_CHANNEL_ID;

      const data = await queryMemos(
        "/delete/memory",
        {
          user_ids: [actualUserId],
          memory_ids
        },
        process.env.MEMOS_API_KEY
      );

      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : "Unknown error"}` }],
        isError: true
      };
    }
  }
)



server.tool(
  "add_feedback",
  `
  Trigger: User wants to MODIFY, UPDATE, or DELETE (without providing IDs) specific memories.
  Purpose: Modify/Delete existing memories based on natural language feedback.
  STRICT RULES:
    1. USAGE: Use this tool for modifying/updating memories OR deleting memories when NO ID is provided.
    2. CONTENT: \`feedback_content\` MUST be ONLY the user's intent (e.g., "User wants to modify memory X", "Delete memory about Y"). 
       - FORBIDDEN: Adding non-user-intent info or verbose narratives.
       - FORBIDDEN: Looking up old memory values to construct a "Change X to Y" request. Just say "User wants Y".
    3. RETRY POLICY: FIRE AND FORGET. Call this tool ONCE.
       - FORBIDDEN: Checking if it worked (searching again).
       - FORBIDDEN: Retrying if it "failed".
       - FORBIDDEN: Sleeping and searching.
       - CRITICAL: If modification seemingly fails, DO NOT attempt to "fix" it by calling \`delete_memory\` and \`add_message\`. Just stop.
    4. DELETION: If user wants to delete but gives no ID, use this tool.
  Parameters:
    - \`conversation_first_message\`: Used to generate the conversation_id.
    - \`feedback_content\`: The natural language update or feedback (no IDs or technical metadata).
    - \`agent_id\`: Agent ID (optional)
    - \`app_id\`: App ID (optional)
    - \`feedback_time\`: Feedback time string (optional, default current UTC)
    - \`allow_public\`: Whether to allow public access (optional, default false)
    - \`allow_knowledgebase_ids\`: List of allowed knowledge base IDs (optional)
  `,
  {
    conversation_first_message: z.string().describe(
      `The first message sent by the user in the entire conversation thread. Used to generate the conversation_id.`
    ),
    feedback_content: z.string().describe("The clear, concise user intent, correction, or feedback. Do NOT include verbose explanations or future instructions."),
    agent_id: z.string().optional().describe("Agent ID associated with the feedback"),
    app_id: z.string().optional().describe("App ID associated with the feedback"),
    feedback_time: z.string().optional().describe("Feedback time string. Default is current UTC time"),
    allow_public: z.boolean().optional().describe("Whether to allow public access. Default is false"),
    allow_knowledgebase_ids: z.array(z.string()).optional().describe("List of knowledge base IDs allowed to be written to")
  },
  async ({ conversation_first_message, feedback_content, agent_id, app_id, feedback_time, allow_public, allow_knowledgebase_ids }) => {
    try {
      if (!process.env.MEMOS_API_KEY) {
        throw new Error("MEMOS_API_KEY is not set, please set it in the environment variables or mcp.json file");
      }

      if (!process.env.MEMOS_USER_ID) {
        throw new Error("MEMOS_USER_ID is not set, please set it in the environment variables or mcp.json file");
      }

      if (!candidateChannelId.includes(MEMOS_CHANNEL_ID)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL_ID);
      }

      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;
      const actualUserId = MEMOS_CHANNEL_ID === "MEMOS" ? process.env.MEMOS_USER_ID : process.env.MEMOS_USER_ID + "-" + MEMOS_CHANNEL_ID;

      const data = await queryMemos(
        "/add/feedback",
        {
          user_id: actualUserId,
          conversation_id: actualConversationId,
          feedback_content,
          agent_id,
          app_id,
          feedback_time,
          allow_public,
          allow_knowledgebase_ids
        },
        process.env.MEMOS_API_KEY
      );

      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : "Unknown error"}` }],
        isError: true
      };
    }
  }
)

async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error(JSON.stringify({ error: "Error occurred while starting server", details: String(error) }));
    throw error;
  }
}

startServer().catch((error: any) => {
  console.error(JSON.stringify({ error: "Server failed to start", details: String(error) }));
  process.exit(1);
});
