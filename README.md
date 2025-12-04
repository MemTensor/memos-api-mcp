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
     - `conversation_id`: Conversation ID to identify which conversation the message belongs to
     - `messages`: Array of messages containing role and content information
       - `role`: Role of the message sender, e.g., user, assistant
       - `content`: Message content

2. `search_memory`
   - Searches for memories in a conversation
   - Parameters:
     - `query`: Search query to find relevant content in conversation history
     - `conversation_id`: Conversation ID to define the search scope
     - `memory_limit_number`: Maximum number of results to return, defaults to 6

3. `get_message`
   - Retrieves messages from a conversation
   - Parameters:
     - `conversation_id`: Conversation ID to identify which conversation's messages to retrieve

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