import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Md5 } from "ts-md5"
import dayjs from "dayjs"
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

const MEMOS_BASE_URL = process.env.MEMOS_BASE_URL || "https://memos.memtensor.cn/api/openmem/v1";
const MEMOS_USER_ID = process.env.MEMOS_USER_ID ?? "<unset>";
const MEMOS_CHANNEL_ID = process.env.MEMOS_CHANNEL?.toUpperCase() ?? "MEMOS";
const USER_LITERAL = JSON.stringify(MEMOS_USER_ID);
const candidateChannelId: string[] = ["MODELSCOPE", "MCPSO", "MCPMARKETCN", "MCPMARKETCOM", "MEMOS"];

const server = new McpServer(
  {
    name: "memos-api-mcp",
    version: "1.0.0"
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
- **Parameters**:
  - \`conversation_first_message\`: Same as used in \`search_memory\`
  - \`messages\`: Array with both:
    1) \`{ role: "user", content: "<user question>" }\`
    2) \`{ role: "assistant", content: "<your complete response>" }\`

**Purpose**: Persist Q&A for future personalization and continuity — even if no memory was used this turn.

## ✅ Non-Negotiable Client Responsibilities
1. **Auto-invoke** \`search_memory\` before **every** answer and \`add_message\` after **every** answer.
2. **No user opt-in**: Do not wait for the user to explicitly mention memory/tools/MCP.
3. **Stable \`conversation_first_message\`** across the thread.
4. **Store both user and assistant** messages every turn.
5. **Sequence** must be strictly: Search → Answer → Save.

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
  Trigger: MUST be auto-invoked by the client after completing every answer (final step of each turn).
  Purpose: Persist this turn's user question and assistant answer for memory extraction, personalization, and continuity. This MUST run even if no retrieved memories were used.
  Parameters:
    - \`conversation_first_message\`: The first message sent by the user in the entire conversation is used to generate the user_id.
    - \`messages\`: Array containing BOTH:
      1. \`{ role: "user", content: "user's question" }\`
      2. \`{ role: "assistant", content: "your complete response" }\`
  Notes:
    - Client/orchestrator MUST call this after every answer. Skipping it degrades personalization and continuity.
    - Store only the actual Q&A of this turn; do not store raw retrieval snippets.
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
  Trigger: ONLY when the user explicitly requests to delete specific memories.
  Purpose: Delete specific memories by their IDs. 
  Usage Guidelines:
    - This tool is primarily for developer use or explicit user deletion requests.
    - DO NOT use this tool to "update" a memory by deleting and then re-adding it. To modify or update a memory, use \`add_feedback\` instead.
    - Note: Memory search is paginated. Be cautious when deleting based on search results to ensure you are targeting the correct memory and handling pagination consistency.
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
  Trigger: Auto-invoked when a user provides feedback OR whenever the user wants to MODIFY or UPDATE an existing memory.
  Purpose: Submit user feedback to the MemOS system, or strictly for updating/modifying existing memories.
  Parameters:
    - \`conversation_first_message\`: The first message sent by the user in the entire conversation thread. Used to generate the conversation_id.
    - \`feedback_content\`: Content of the feedback or the update instruction (required)
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
    feedback_content: z.string().describe("The specific content of the feedback"),
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
