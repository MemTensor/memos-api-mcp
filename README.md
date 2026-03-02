# MCP Server for MemOS API

A Model Context Protocol (MCP) implementation for the [MemOS](https://github.com/MemTensor/MemOS) API service. This package provides a command-line interface to interact with MemOS API using MCP standards.

## MCP Configuration

To use this package In MCP Client, use the following configuration:
（You may need to install Node.js first）
```json
{
  "mcpServers": {
    "memos-api-mcp": {
      "command": "npx",
      "args": ["-y", "@memtensor/memos-api-mcp"],
      "env": {
        "MEMOS_API_KEY": "your-api-key",
        "MEMOS_USER_ID": "your-user-id",
        "MEMOS_CHANNEL": "the-site-where-you-are-seeing-this-document"
      }
    }
  }
}
```

### Configuration Explanation
- `command`: Uses `npx` to run the package
- `args`: Arguments passed to npx to run the package
- `env`: Environment variables
  - `MEMOS_API_KEY`: Your Memos API key for authentication (Get your API Key in Dashboard[https://memos-dashboard-pre.openmem.net/cn/quickstart/])
  - `MEMOS_USER_ID`: Stable per-human identifier. MUST be deterministic and non-PII, and MUST remain the same for the same person across devices/sessions. NEVER reuse across different people. DO NOT use random values, device IDs, or model/chat session IDs. Recommended: SHA-256(lowercase(trim(email))) or your SSO subject/employee ID.
  - `MEMOS_CHANNEL`: The site where you are seeing this document. Candidate values: `MODELSCOPE`, `MCPSO`, `MCPMARKETCN`, `MCPMARKETCOM`, `GLAMA`, `PULSEMCP`, `MCPSERVERS`,`LOBEHUB`,`MEMOS`(meaning the MemOS official website), `GITHUB`(meaning this README file)

### Available MCP Tools
This package provides the following MCP tools:

1. `add_message`
   - Adds a new message to a conversation
   - Parameters:
     - `conversation_id`: Unique identifier of the conversation associated with the feedback.
     - `messages`: Array of messages containing role and content information.
       - `role`: Role of the message sender (`user` or `assistant`).
       - `content`: Message content.
       - `chat_time`: (Optional) Message timestamp.

2. `search_memory`
   - Searches for memories in a conversation.
   - Parameters:
     - `query`: Text content to search within the memories. The token limit for a single query is 4k.
     - `filter`: (Optional) Filter conditions, used to precisely limit the memory scope before retrieval.
     - `knowledgebase_ids`: (Optional) Array specifying the knowledge bases to search. 
       - **DO NOT USE THIS** unless the user explicitly mentions "knowledge base" or "KB".
       - 1) If the user explicitly asks to search ALL knowledge bases -> pass `["all"]`.
       - 2) If the user specifies particular KB IDs -> pass those IDs.
       - 3) If the user DOES NOT mention knowledge bases -> OMIT this parameter (do not send it).
     - `include_preference`: (Optional) Enable preference memory recall. Default: true.
     - `preference_limit_number`: (Optional) Max preference memories to return. Default: 9, max 25.
     - `include_tool_memory`: (Optional) Enable tool memory recall. Default: false.
     - `tool_memory_limit_number`: (Optional) Max tool memories to return. Default: 6, max 25.
     - `include_skill`: (Optional) Enable Skill recall. Default: false.
     - `skill_limit_number`: (Optional) Max Skills to return. Default: 6, max 25.
     - `relativity`: (Optional) Relevance threshold (0-1) for recalled memories. A value of 0 disables relevance filtering.
     - `conversation_first_message`: First user message in the thread (used to generate conversation_id).
     - `memory_limit_number`: Maximum number of memories that can be recalled. Default: 9, max 25.

3. `delete_memory`
   - Delete specific memories by their IDs.
   - Parameters:
     - `user_ids`: List of user IDs whose memories will be deleted.
     - `memory_ids`: List of memory IDs to delete.

4. `add_feedback`
   - Submit user feedback to the MemOS system.
   - Note: Feedback is applied asynchronously — `add_feedback` returns immediately (often with a `task_id`), and the effect may take a short time to appear.
   - Parameters:
     - `user_id`: The user identifier associated with the feedback.
     - `conversation_id`: Unique identifier of the conversation associated with the feedback.
     - `feedback_content`: The specific content of the feedback.
     - `agent_id`: (Optional) Agent ID associated with the feedback.
     - `app_id`: (Optional) App ID associated with the feedback.
     - `feedback_time`: (Optional) Feedback time string (default: current UTC time).
     - `allow_public`: (Optional) Whether to allow public access (default: false).
     - `allow_knowledgebase_ids`: (Optional) List of knowledge base IDs allowed to be written to.



All tools use the same configuration and require the `MEMOS_API_KEY` environment variable.

## Features

- MCP-compliant API interface
- Command-line tool for easy interaction
- Built with TypeScript for type safety
- Express.js server implementation
- Zod schema validation

## Prerequisites

- Node.js >= 18
- npm or pnpm (recommended)

## Installation

You can install the package globally using npm:

```bash
npm install -g @memtensor/memos-api-mcp
```

Or using pnpm:

```bash
pnpm add -g @memtensor/memos-api-mcp
```

## Usage

After installation, you can run the CLI tool using:

```bash
npx @memtensor/memos-api-mcp
```

Or if installed globally:

```bash
memos-api-mcp
```

## Development

1. Clone the repository:
```bash
git clone <repository-url>
cd memos-api-mcp
```

2. Install dependencies:
```bash
pnpm install
```

3. Start development server:
```bash
pnpm dev
```

4. Build the project:
```bash
pnpm build
```

## Available Scripts

- `pnpm build` - Build the project
- `pnpm dev` - Start development server using tsx
- `pnpm start` - Run the built version
- `pnpm inspect` - Inspect the MCP implementation using @modelcontextprotocol/inspector

## Project Structure

```
memos-mcp/
├── src/           # Source code
├── build/         # Compiled JavaScript files
├── package.json   # Project configuration
└── tsconfig.json  # TypeScript configuration
```

## Dependencies

- `@modelcontextprotocol/sdk`: ^1.0.0
- `express`: ^4.19.2
- `zod`: ^3.23.8
- `ts-md5`: ^2.0.0

## Version

Current version: 1.0.0-beta.2
