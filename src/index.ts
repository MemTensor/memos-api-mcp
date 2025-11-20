import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Md5 } from "ts-md5"
import dayjs from "dayjs"

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
const MEMOS_CHANNEL = process.env.MEMOS_CHANNEL?.toUpperCase() ?? "MODELSCOPE_REMOTE";
const candidateChannelId: string[] = ["MODELSCOPE", "MCPSO", "MCPMARKETCN", "MCPMARKETCOM", "MEMOS", "GITHUB", "GLAMA", "PULSEMCP", "MCPSERVERS", "LOBEHUB", "MODELSCOPE_REMOTE"];

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

async function queryMemos(path: string, body: Record<string, any>, apiKey: string, source: string) {
  const res = await fetch(`${MEMOS_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${apiKey}`
    },
    body: JSON.stringify({ ...body, source: source })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
  }
  return res.json();
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

      if (!candidateChannelId.includes(MEMOS_CHANNEL)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL + ", candidates: " + candidateChannelId.join(", "));
      }

      // If no conversation_id provided, fall back to environment variable
      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;

      const newMessages = messages.map(message => ({
        role: message.role,
        content: message.content,
        chat_time: message.chat_time || generateChatTime()
      }));

      const data = await queryMemos(
        "/add/message",
        { 
          user_id: process.env.MEMOS_USER_ID, 
          conversation_id: actualConversationId, 
          messages: newMessages 
        },
        process.env.MEMOS_API_KEY,
        MEMOS_CHANNEL
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

      if (!candidateChannelId.includes(MEMOS_CHANNEL)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL);
      }

      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;
      
      const data = await queryMemos(
        "/search/memory",
        {
          query,
          user_id: process.env.MEMOS_USER_ID,
          conversation_id: actualConversationId,
          memory_limit_number: memory_limit_number || 6
        },
        process.env.MEMOS_API_KEY,
        MEMOS_CHANNEL
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
  "get_message",
  `
  Trigger: When the user asks for the full conversation history or requests a summary of the conversation.
  Purpose: Retrieve the complete message history of a specific conversation thread for analysis, review, or summarization.
  Parameters:
    - \`conversation_first_message\`: First user message in the thread (used to generate conversation_id).
  `,
  {
    conversation_first_message: z.string().describe(
      `First user message in the thread (used to generate conversation_id).`
    )
  },
  async ({ conversation_first_message }: { conversation_first_message: string }) => {
    try {

      if (!process.env.MEMOS_API_KEY) {
        throw new Error("MEMOS_API_KEY is not set, please set it in the environment variables or mcp.json file");
      }

      if (!process.env.MEMOS_USER_ID) {
        throw new Error("MEMOS_USER_ID is not set, please set it in the environment variables or mcp.json file");
      }

      if (!candidateChannelId.includes(MEMOS_CHANNEL)) {
        throw new Error("Unknown channel: " + MEMOS_CHANNEL);
      }

      const actualConversationId = stringToMd5(process.env.MEMOS_USER_ID + '\n' + conversation_first_message) || process.env.MEMOS_CONVERSATION_ID;
      

      const data = await queryMemos(
        "/get/message",
        { 
          user_id: process.env.MEMOS_USER_ID, 
          conversation_id: actualConversationId 
        },
        process.env.MEMOS_API_KEY,
        MEMOS_CHANNEL
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
