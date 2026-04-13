// Mock data for GitHub Pages demo / ?demo mode
// Provides realistic dummy data for all API endpoints

import type {
  StatusResponse,
  SessionInfo,
  SessionMessagesResponse,
  AnalyticsResponse,
  LogsResponse,
  EnvVarInfo,
  CronJob,
  SkillInfo,
  ToolsetInfo,
} from "./api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

function daysAgo(d: number, hoursOffset = 0): number {
  return now - d * DAY - hoursOffset * HOUR;
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString();
}

function fmtDay(daysBack: number): string {
  const d = new Date(now - daysBack * DAY);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const mockStatus: StatusResponse = {
  version: "0.8.0",
  release_date: "2025-04-07",
  active_sessions: 2,
  gateway_running: true,
  gateway_pid: 42891,
  gateway_state: "running",
  gateway_exit_reason: null,
  gateway_updated_at: isoDate(now - 12 * HOUR),
  gateway_platforms: {
    discord: {
      state: "connected",
      updated_at: isoDate(now - 12 * HOUR),
    },
    telegram: {
      state: "connected",
      updated_at: isoDate(now - 12 * HOUR),
    },
  },
  config_path: "/home/user/.config/hermes/config.yaml",
  env_path: "/home/user/.config/hermes/.env",
  config_version: 15,
  latest_config_version: 16,
  hermes_home: "/home/user/.config/hermes",
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const mockSessions: SessionInfo[] = [
  // Active sessions (2)
  {
    id: "sess_a1b2c3d4",
    source: "cli",
    model: "anthropic/claude-opus-4-6",
    title: "Refactor authentication middleware",
    started_at: daysAgo(0, 1.5),
    ended_at: null,
    last_active: now - 120_000,
    is_active: true,
    message_count: 47,
    tool_call_count: 18,
    input_tokens: 245_000,
    output_tokens: 38_200,
    preview: "I've restructured the auth middleware to use a chain-of-responsibility pattern. The JWT validation, rate limiting, and RBAC checks are now separate handlers that can be composed...",
  },
  {
    id: "sess_e5f6g7h8",
    source: "discord",
    model: "anthropic/claude-sonnet-4-20250514",
    title: "Debug WebSocket reconnection",
    started_at: daysAgo(0, 3),
    ended_at: null,
    last_active: now - 300_000,
    is_active: true,
    message_count: 23,
    tool_call_count: 8,
    input_tokens: 128_000,
    output_tokens: 21_500,
    preview: "The WebSocket client wasn't handling the 1006 close code correctly. I've added exponential backoff with jitter and a maximum retry limit of 10 attempts...",
  },
  // Recent sessions (10)
  {
    id: "sess_i9j0k1l2",
    source: "telegram",
    model: "nous/hermes-3-llama-3.1-70b",
    title: "Research GRPO training approaches",
    started_at: daysAgo(0, 8),
    ended_at: daysAgo(0, 6),
    last_active: daysAgo(0, 6),
    is_active: false,
    message_count: 56,
    tool_call_count: 12,
    input_tokens: 312_000,
    output_tokens: 67_400,
    preview: "GRPO (Group Relative Policy Optimization) differs from standard RLHF in that it eliminates the need for a separate reward model. Instead, it compares responses within a group...",
  },
  {
    id: "sess_m3n4o5p6",
    source: "cli",
    model: "anthropic/claude-opus-4-6",
    title: "Weekly metrics summary",
    started_at: daysAgo(1, 2),
    ended_at: daysAgo(1, 1),
    last_active: daysAgo(1, 1),
    is_active: false,
    message_count: 12,
    tool_call_count: 5,
    input_tokens: 89_000,
    output_tokens: 15_300,
    preview: "Here's the weekly summary: 47 sessions completed, 2.3M tokens processed, average session length 34 minutes. Top models by usage: claude-opus-4-6 (62%), hermes-3 (24%)...",
  },
  {
    id: "sess_q7r8s9t0",
    source: "cron",
    model: "anthropic/claude-sonnet-4-20250514",
    title: "Daily standup summary",
    started_at: daysAgo(1, 15),
    ended_at: daysAgo(1, 14.8),
    last_active: daysAgo(1, 14.8),
    is_active: false,
    message_count: 5,
    tool_call_count: 2,
    input_tokens: 42_000,
    output_tokens: 8_100,
    preview: "Good morning! Yesterday's highlights: merged PR #142 (auth refactor), started work on WebSocket reconnection logic, and updated the deployment docs...",
  },
  {
    id: "sess_u1v2w3x4",
    source: "discord",
    model: "deepseek/deepseek-r1",
    title: "Optimize database query performance",
    started_at: daysAgo(2, 4),
    ended_at: daysAgo(2, 2),
    last_active: daysAgo(2, 2),
    is_active: false,
    message_count: 89,
    tool_call_count: 34,
    input_tokens: 478_000,
    output_tokens: 92_100,
    preview: "After analyzing the slow query log, the main bottleneck is the N+1 query pattern in the session listing endpoint. Adding a JOIN with eager loading reduced the query count from 47 to 3...",
  },
  {
    id: "sess_y5z6a7b8",
    source: "cli",
    model: "anthropic/claude-opus-4-6",
    title: "Set up CI/CD pipeline for staging",
    started_at: daysAgo(2, 10),
    ended_at: daysAgo(2, 7),
    last_active: daysAgo(2, 7),
    is_active: false,
    message_count: 156,
    tool_call_count: 48,
    input_tokens: 890_000,
    output_tokens: 145_000,
    preview: "I've created the GitHub Actions workflow with three stages: lint/test, build Docker image, and deploy to staging. The staging environment uses the same Kubernetes manifests...",
  },
  {
    id: "sess_c9d0e1f2",
    source: "telegram",
    model: "nous/hermes-3-llama-3.1-70b",
    title: "Explain transformer attention mechanism",
    started_at: daysAgo(3, 6),
    ended_at: daysAgo(3, 5),
    last_active: daysAgo(3, 5),
    is_active: false,
    message_count: 18,
    tool_call_count: 0,
    input_tokens: 67_000,
    output_tokens: 24_300,
    preview: "The self-attention mechanism computes three matrices from the input: Query (Q), Key (K), and Value (V). The attention scores are calculated as softmax(QK^T / sqrt(d_k))V...",
  },
  {
    id: "sess_g3h4i5j6",
    source: "cli",
    model: "anthropic/claude-opus-4-6",
    title: "Migrate Redis cache to Dragonfly",
    started_at: daysAgo(4, 3),
    ended_at: daysAgo(4, 1),
    last_active: daysAgo(4, 1),
    is_active: false,
    message_count: 72,
    tool_call_count: 28,
    input_tokens: 345_000,
    output_tokens: 58_900,
    preview: "Dragonfly is a drop-in replacement for Redis with better memory efficiency. The migration involves updating the connection string and adjusting the maxmemory-policy...",
  },
  {
    id: "sess_k7l8m9n0",
    source: "cron",
    model: "anthropic/claude-sonnet-4-20250514",
    title: "Nightly backup verification",
    started_at: daysAgo(5, 0.5),
    ended_at: daysAgo(5, 0.3),
    last_active: daysAgo(5, 0.3),
    is_active: false,
    message_count: 8,
    tool_call_count: 4,
    input_tokens: 35_000,
    output_tokens: 6_200,
    preview: "Backup verification complete. All 3 databases backed up successfully. Total backup size: 2.4 GB. Oldest backup in rotation: 30 days. No integrity errors detected.",
  },
  {
    id: "sess_o1p2q3r4",
    source: "discord",
    model: "deepseek/deepseek-r1",
    title: "Write unit tests for payment module",
    started_at: daysAgo(6, 5),
    ended_at: daysAgo(6, 2),
    last_active: daysAgo(6, 2),
    is_active: false,
    message_count: 198,
    tool_call_count: 42,
    input_tokens: 920_000,
    output_tokens: 178_000,
    preview: "I've written 34 unit tests covering the payment processing flow including edge cases for currency conversion, partial refunds, and failed webhook deliveries...",
  },
  {
    id: "sess_s5t6u7v8",
    source: "cli",
    model: "anthropic/claude-opus-4-6",
    title: "Review PR #156: Add rate limiting",
    started_at: daysAgo(6, 12),
    ended_at: daysAgo(6, 11),
    last_active: daysAgo(6, 11),
    is_active: false,
    message_count: 31,
    tool_call_count: 15,
    input_tokens: 167_000,
    output_tokens: 29_400,
    preview: "The rate limiting implementation looks solid. A few suggestions: consider using a sliding window instead of fixed window, and the Redis key prefix should include the API version...",
  },
];

// ---------------------------------------------------------------------------
// Session messages (for expanded view)
// ---------------------------------------------------------------------------

function makeMessages(sessionId: string): SessionMessagesResponse {
  const baseTs = mockSessions.find((s) => s.id === sessionId)?.started_at ?? now;
  return {
    session_id: sessionId,
    messages: [
      {
        role: "user",
        content: "Let's start working on this task. First, can you review the current implementation?",
        timestamp: baseTs,
      },
      {
        role: "assistant",
        content:
          "I'll take a look at the current codebase to understand the existing implementation before making any changes.",
        tool_calls: [
          {
            id: "call_001",
            function: {
              name: "file_read",
              arguments: JSON.stringify({ path: "src/main.ts" }),
            },
          },
        ],
        timestamp: baseTs + 5_000,
      },
      {
        role: "tool",
        content: '// main.ts\nimport { createServer } from "./server";\nimport { loadConfig } from "./config";\n\nconst config = loadConfig();\ncreateServer(config).listen(3000);',
        tool_name: "file_read",
        tool_call_id: "call_001",
        timestamp: baseTs + 6_000,
      },
      {
        role: "assistant",
        content:
          "I can see the entry point. The server setup is straightforward. Let me also check the server module to understand the middleware chain.",
        tool_calls: [
          {
            id: "call_002",
            function: {
              name: "file_read",
              arguments: JSON.stringify({ path: "src/server.ts" }),
            },
          },
        ],
        timestamp: baseTs + 10_000,
      },
      {
        role: "tool",
        content:
          '// server.ts\nimport express from "express";\nimport { authMiddleware } from "./middleware/auth";\n\nexport function createServer(config: Config) {\n  const app = express();\n  app.use(authMiddleware(config));\n  return app;\n}',
        tool_name: "file_read",
        tool_call_id: "call_002",
        timestamp: baseTs + 11_000,
      },
      {
        role: "assistant",
        content:
          "I've reviewed the current implementation. The auth middleware is tightly coupled to the server setup. Here's my plan:\n\n1. Extract the middleware into composable handlers\n2. Add proper error handling for each step\n3. Implement the chain-of-responsibility pattern\n\nLet me start with the refactor.",
        timestamp: baseTs + 20_000,
      },
      {
        role: "user",
        content: "Looks good, go ahead with the refactor.",
        timestamp: baseTs + 45_000,
      },
      {
        role: "assistant",
        content:
          "I've restructured the auth middleware into three separate, composable handlers:\n\n- `jwtValidator` — verifies the JWT token and extracts claims\n- `rateLimiter` — checks rate limits per-user using a sliding window\n- `rbacChecker` — validates role-based access for the requested resource\n\nEach handler follows the same interface and can be used independently or composed together.",
        tool_calls: [
          {
            id: "call_003",
            function: {
              name: "file_write",
              arguments: JSON.stringify({
                path: "src/middleware/auth-chain.ts",
                content: "// refactored auth chain...",
              }),
            },
          },
        ],
        timestamp: baseTs + 60_000,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Analytics (30 days)
// ---------------------------------------------------------------------------

function generateDailyAnalytics(): AnalyticsResponse {
  const daily = [];
  for (let d = 29; d >= 0; d--) {
    // Weekend days have lower usage
    const date = new Date(now - d * DAY);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const scale = isWeekend ? 0.4 : 1.0;
    const jitter = 0.7 + Math.sin(d * 1.7) * 0.3; // deterministic variation

    const inputTokens = Math.round((50_000 + 350_000 * jitter) * scale);
    const outputTokens = Math.round((8_000 + 72_000 * jitter) * scale);
    const cacheReadTokens = Math.round(inputTokens * (0.6 + 0.2 * Math.abs(Math.sin(d * 0.8))));
    const reasoningTokens = Math.round(outputTokens * 0.15);
    const sessions = Math.round((3 + 5 * jitter) * scale);
    const estimatedCost = parseFloat(((inputTokens * 0.000015 + outputTokens * 0.000075) * 0.6).toFixed(2));
    const actualCost = parseFloat((estimatedCost * (0.3 + 0.15 * Math.abs(Math.sin(d)))).toFixed(2));

    daily.push({
      day: fmtDay(d),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      reasoning_tokens: reasoningTokens,
      estimated_cost: estimatedCost,
      actual_cost: actualCost,
      sessions,
    });
  }

  const totals = daily.reduce(
    (acc, d) => ({
      total_input: acc.total_input + d.input_tokens,
      total_output: acc.total_output + d.output_tokens,
      total_cache_read: acc.total_cache_read + d.cache_read_tokens,
      total_reasoning: acc.total_reasoning + d.reasoning_tokens,
      total_estimated_cost: parseFloat((acc.total_estimated_cost + d.estimated_cost).toFixed(2)),
      total_actual_cost: parseFloat((acc.total_actual_cost + d.actual_cost).toFixed(2)),
      total_sessions: acc.total_sessions + d.sessions,
    }),
    {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_reasoning: 0,
      total_estimated_cost: 0,
      total_actual_cost: 0,
      total_sessions: 0,
    },
  );

  return {
    daily,
    by_model: [
      {
        model: "anthropic/claude-opus-4-6",
        input_tokens: Math.round(totals.total_input * 0.52),
        output_tokens: Math.round(totals.total_output * 0.55),
        estimated_cost: parseFloat((totals.total_estimated_cost * 0.62).toFixed(2)),
        sessions: Math.round(totals.total_sessions * 0.45),
      },
      {
        model: "anthropic/claude-sonnet-4-20250514",
        input_tokens: Math.round(totals.total_input * 0.22),
        output_tokens: Math.round(totals.total_output * 0.2),
        estimated_cost: parseFloat((totals.total_estimated_cost * 0.18).toFixed(2)),
        sessions: Math.round(totals.total_sessions * 0.25),
      },
      {
        model: "nous/hermes-3-llama-3.1-70b",
        input_tokens: Math.round(totals.total_input * 0.16),
        output_tokens: Math.round(totals.total_output * 0.15),
        estimated_cost: parseFloat((totals.total_estimated_cost * 0.08).toFixed(2)),
        sessions: Math.round(totals.total_sessions * 0.18),
      },
      {
        model: "deepseek/deepseek-r1",
        input_tokens: Math.round(totals.total_input * 0.10),
        output_tokens: Math.round(totals.total_output * 0.10),
        estimated_cost: parseFloat((totals.total_estimated_cost * 0.12).toFixed(2)),
        sessions: Math.round(totals.total_sessions * 0.12),
      },
    ],
    totals,
  };
}

export const mockAnalytics = generateDailyAnalytics();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const mockConfig: Record<string, unknown> = {
  model: "anthropic/claude-opus-4-6",
  fallback_providers: "openrouter,deepseek",
  toolsets: "hermes-cli",
  file_read_max_chars: 100000,
  timezone: "America/Los_Angeles",
  agent: {
    max_turns: 200,
    max_tool_calls_per_turn: 10,
    thinking_budget: 32768,
    temperature: 0.7,
  },
  terminal: {
    shell: "/bin/zsh",
    timeout: 120,
    max_output_chars: 50000,
  },
  display: {
    theme: "dark",
    show_token_usage: true,
    stream_responses: true,
    markdown_rendering: true,
  },
  memory: {
    enabled: true,
    backend: "sqlite",
    max_context_messages: 100,
  },
  security: {
    sandbox_mode: false,
    allowed_directories: ["/home/user/projects", "/tmp"],
    blocked_commands: ["rm -rf /", "mkfs", "dd if=/dev/zero"],
  },
};

export const mockDefaults: Record<string, unknown> = {
  model: "anthropic/claude-sonnet-4-20250514",
  fallback_providers: "",
  toolsets: "hermes-cli",
  file_read_max_chars: 50000,
  timezone: "UTC",
  agent: {
    max_turns: 100,
    max_tool_calls_per_turn: 5,
    thinking_budget: 16384,
    temperature: 0.7,
  },
  terminal: {
    shell: "/bin/bash",
    timeout: 60,
    max_output_chars: 20000,
  },
  display: {
    theme: "dark",
    show_token_usage: false,
    stream_responses: true,
    markdown_rendering: true,
  },
  memory: {
    enabled: false,
    backend: "sqlite",
    max_context_messages: 50,
  },
  security: {
    sandbox_mode: true,
    allowed_directories: [],
    blocked_commands: [],
  },
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const mockSchema = {
  category_order: ["general", "agent", "terminal", "display", "memory", "security"],
  fields: {
    model: {
      type: "string",
      category: "general",
      label: "Model",
      description: "Primary model to use for agent sessions",
      default: "anthropic/claude-sonnet-4-20250514",
    },
    fallback_providers: {
      type: "string",
      category: "general",
      label: "Fallback Providers",
      description: "Comma-separated list of fallback providers if primary is unavailable",
      default: "",
    },
    toolsets: {
      type: "string",
      category: "general",
      label: "Toolsets",
      description: "Comma-separated list of enabled toolsets",
      default: "hermes-cli",
    },
    file_read_max_chars: {
      type: "integer",
      category: "general",
      label: "File Read Max Chars",
      description: "Maximum characters to read from a single file",
      default: 50000,
    },
    timezone: {
      type: "string",
      category: "general",
      label: "Timezone",
      description: "Timezone for scheduling and display",
      default: "UTC",
    },
    "agent.max_turns": {
      type: "integer",
      category: "agent",
      label: "Max Turns",
      description: "Maximum number of agent turns per session",
      default: 100,
    },
    "agent.max_tool_calls_per_turn": {
      type: "integer",
      category: "agent",
      label: "Max Tool Calls Per Turn",
      description: "Maximum tool calls allowed in a single turn",
      default: 5,
    },
    "agent.thinking_budget": {
      type: "integer",
      category: "agent",
      label: "Thinking Budget",
      description: "Token budget for extended thinking / chain-of-thought",
      default: 16384,
    },
    "agent.temperature": {
      type: "number",
      category: "agent",
      label: "Temperature",
      description: "Sampling temperature for model responses",
      default: 0.7,
    },
    "terminal.shell": {
      type: "string",
      category: "terminal",
      label: "Shell",
      description: "Default shell for terminal commands",
      default: "/bin/bash",
    },
    "terminal.timeout": {
      type: "integer",
      category: "terminal",
      label: "Timeout",
      description: "Command execution timeout in seconds",
      default: 60,
    },
    "terminal.max_output_chars": {
      type: "integer",
      category: "terminal",
      label: "Max Output Chars",
      description: "Maximum characters captured from command output",
      default: 20000,
    },
    "display.theme": {
      type: "string",
      category: "display",
      label: "Theme",
      description: "UI color theme",
      default: "dark",
      enum: ["dark", "light"],
    },
    "display.show_token_usage": {
      type: "boolean",
      category: "display",
      label: "Show Token Usage",
      description: "Display token usage after each response",
      default: false,
    },
    "display.stream_responses": {
      type: "boolean",
      category: "display",
      label: "Stream Responses",
      description: "Stream model output in real-time",
      default: true,
    },
    "display.markdown_rendering": {
      type: "boolean",
      category: "display",
      label: "Markdown Rendering",
      description: "Render markdown formatting in responses",
      default: true,
    },
    "memory.enabled": {
      type: "boolean",
      category: "memory",
      label: "Enabled",
      description: "Enable persistent memory across sessions",
      default: false,
    },
    "memory.backend": {
      type: "string",
      category: "memory",
      label: "Backend",
      description: "Storage backend for memory",
      default: "sqlite",
      enum: ["sqlite", "postgres"],
    },
    "memory.max_context_messages": {
      type: "integer",
      category: "memory",
      label: "Max Context Messages",
      description: "Maximum number of messages loaded as context",
      default: 50,
    },
    "security.sandbox_mode": {
      type: "boolean",
      category: "security",
      label: "Sandbox Mode",
      description: "Restrict agent to sandboxed execution environment",
      default: true,
    },
    "security.allowed_directories": {
      type: "array",
      category: "security",
      label: "Allowed Directories",
      description: "Directories the agent is allowed to access",
      default: [],
    },
    "security.blocked_commands": {
      type: "array",
      category: "security",
      label: "Blocked Commands",
      description: "Shell commands that are blocked from execution",
      default: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Config raw YAML
// ---------------------------------------------------------------------------

export const mockConfigRaw = `# Hermes Agent Configuration
# Version: 16

model: anthropic/claude-opus-4-6
fallback_providers: openrouter,deepseek
toolsets: hermes-cli
file_read_max_chars: 100000
timezone: America/Los_Angeles

agent:
  max_turns: 200
  max_tool_calls_per_turn: 10
  thinking_budget: 32768
  temperature: 0.7

terminal:
  shell: /bin/zsh
  timeout: 120
  max_output_chars: 50000

display:
  theme: dark
  show_token_usage: true
  stream_responses: true
  markdown_rendering: true

memory:
  enabled: true
  backend: sqlite
  max_context_messages: 100

security:
  sandbox_mode: false
  allowed_directories:
    - /home/user/projects
    - /tmp
  blocked_commands:
    - rm -rf /
    - mkfs
    - dd if=/dev/zero
`;

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

export const mockEnvVars: Record<string, EnvVarInfo> = {
  OPENROUTER_API_KEY: {
    is_set: true,
    redacted_value: "sk-or-v1-****...a3f7",
    description: "API key for OpenRouter (multi-model gateway)",
    url: "https://openrouter.ai/keys",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  ANTHROPIC_API_KEY: {
    is_set: true,
    redacted_value: "sk-ant-****...9d2e",
    description: "API key for Anthropic (Claude models)",
    url: "https://console.anthropic.com/settings/keys",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  OPENAI_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for OpenAI (GPT models)",
    url: "https://platform.openai.com/api-keys",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  GOOGLE_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for Google AI (Gemini models)",
    url: "https://aistudio.google.com/app/apikey",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  DEEPSEEK_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for DeepSeek",
    url: "https://platform.deepseek.com/api_keys",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  DEEPSEEK_BASE_URL: {
    is_set: false,
    redacted_value: null,
    description: "Custom DeepSeek API base URL (advanced)",
    url: null,
    category: "provider",
    is_password: false,
    tools: [],
    advanced: true,
  },
  NOUS_BASE_URL: {
    is_set: false,
    redacted_value: null,
    description: "Nous Portal base URL override",
    url: null,
    category: "provider",
    is_password: false,
    tools: [],
    advanced: true,
  },
  GEMINI_BASE_URL: {
    is_set: false,
    redacted_value: null,
    description: "Google AI Studio base URL override",
    url: null,
    category: "provider",
    is_password: false,
    tools: [],
    advanced: true,
  },
  HF_TOKEN: {
    is_set: false,
    redacted_value: null,
    description: "Hugging Face token for Inference Providers (20+ open models via router.huggingface.co)",
    url: "https://huggingface.co/settings/tokens",
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  XIAOMI_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "Xiaomi MiMo API key for MiMo models",
    url: null,
    category: "provider",
    is_password: true,
    tools: [],
    advanced: false,
  },
  FIRECRAWL_API_KEY: {
    is_set: true,
    redacted_value: "fc-****...b8c1",
    description: "API key for Firecrawl web scraping service",
    url: "https://firecrawl.dev/app/api-keys",
    category: "tool",
    is_password: true,
    tools: ["web-search", "browser-automation"],
    advanced: false,
  },
  BROWSERBASE_API_KEY: {
    is_set: true,
    redacted_value: "bb-****...4e2a",
    description: "API key for Browserbase headless browser service",
    url: "https://www.browserbase.com/settings",
    category: "tool",
    is_password: true,
    tools: ["browser-automation"],
    advanced: false,
  },
  BROWSERBASE_PROJECT_ID: {
    is_set: true,
    redacted_value: "proj_****...7f3d",
    description: "Project ID for Browserbase",
    url: "https://www.browserbase.com/settings",
    category: "tool",
    is_password: false,
    tools: ["browser-automation"],
    advanced: false,
  },
  TAVILY_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for Tavily search API",
    url: "https://tavily.com/#api",
    category: "tool",
    is_password: true,
    tools: ["web-search"],
    advanced: false,
  },
  DISCORD_BOT_TOKEN: {
    is_set: false,
    redacted_value: null,
    description: "Discord bot token for gateway integration",
    url: "https://discord.com/developers/applications",
    category: "messaging",
    is_password: true,
    tools: [],
    advanced: false,
  },
  TELEGRAM_BOT_TOKEN: {
    is_set: false,
    redacted_value: null,
    description: "Telegram bot token for gateway integration",
    url: "https://core.telegram.org/bots#botfather",
    category: "messaging",
    is_password: true,
    tools: [],
    advanced: false,
  },
  SLACK_BOT_TOKEN: {
    is_set: false,
    redacted_value: null,
    description: "Slack bot token for workspace integration",
    url: "https://api.slack.com/apps",
    category: "messaging",
    is_password: true,
    tools: [],
    advanced: false,
  },
  EXA_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for Exa neural search",
    url: "https://dashboard.exa.ai/api-keys",
    category: "tool",
    is_password: true,
    tools: ["web-search"],
    advanced: true,
  },
  ELEVENLABS_API_KEY: {
    is_set: false,
    redacted_value: null,
    description: "API key for ElevenLabs text-to-speech",
    url: "https://elevenlabs.io/app/settings/api-keys",
    category: "tool",
    is_password: true,
    tools: ["text-to-speech"],
    advanced: true,
  },
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const mockSkills: SkillInfo[] = [
  { name: "web-search", description: "Search the web and extract content from URLs using Firecrawl or Tavily", category: "general", enabled: true },
  { name: "code-review", description: "Automated code review with style checking, bug detection, and suggestions", category: "software-development", enabled: true },
  { name: "git-operations", description: "Git workflow management: commit, branch, merge, rebase, and conflict resolution", category: "software-development", enabled: true },
  { name: "docker-management", description: "Build, run, and manage Docker containers and compose stacks", category: "software-development", enabled: true },
  { name: "arxiv-search", description: "Search and summarize papers from arXiv, with citation extraction", category: "research", enabled: true },
  { name: "memory-management", description: "Store and retrieve information across sessions using persistent memory", category: "general", enabled: true },
  { name: "file-operations", description: "Advanced file manipulation: read, write, search, diff, and patch files", category: "general", enabled: true },
  { name: "terminal-tools", description: "Execute shell commands with sandboxing and output capture", category: "general", enabled: true },
  { name: "browser-automation", description: "Headless browser control for web scraping and testing via Browserbase", category: "general", enabled: true },
  { name: "image-analysis", description: "Analyze images, extract text (OCR), and describe visual content", category: "general", enabled: true },
  { name: "text-to-speech", description: "Convert text to natural-sounding speech using ElevenLabs", category: "general", enabled: false },
  { name: "discord-integration", description: "Send and receive messages in Discord channels and threads", category: "general", enabled: false },
  { name: "cron-scheduler", description: "Schedule recurring tasks with cron expressions", category: "general", enabled: false },
  { name: "database-query", description: "Execute SQL queries against PostgreSQL, MySQL, and SQLite databases", category: "software-development", enabled: false },
  { name: "api-testing", description: "Send HTTP requests, validate responses, and run API test suites", category: "software-development", enabled: false },
];

// ---------------------------------------------------------------------------
// Toolsets
// ---------------------------------------------------------------------------

export const mockToolsets: ToolsetInfo[] = [
  {
    name: "hermes-cli",
    label: "Hermes CLI",
    description: "Core command-line tools for file operations, terminal access, and code editing",
    enabled: true,
    configured: true,
    tools: ["file_read", "file_write", "file_search", "terminal_exec", "code_edit", "directory_list"],
  },
  {
    name: "browser",
    label: "Browser",
    description: "Headless browser automation via Browserbase for web scraping and testing",
    enabled: true,
    configured: true,
    tools: ["browser_navigate", "browser_click", "browser_screenshot", "browser_extract"],
  },
  {
    name: "web-search",
    label: "Web Search",
    description: "Search the web using Firecrawl or Tavily for real-time information retrieval",
    enabled: true,
    configured: true,
    tools: ["web_search", "web_scrape", "web_crawl"],
  },
  {
    name: "voice",
    label: "Voice",
    description: "Text-to-speech synthesis using ElevenLabs for audio output",
    enabled: true,
    configured: false,
    tools: ["tts_speak", "tts_list_voices"],
  },
  {
    name: "discord",
    label: "Discord",
    description: "Discord bot integration for sending messages and managing channels",
    enabled: false,
    configured: false,
    tools: ["discord_send", "discord_read", "discord_react"],
  },
  {
    name: "database",
    label: "Database",
    description: "Direct database access for SQL queries and schema inspection",
    enabled: false,
    configured: false,
    tools: ["db_query", "db_schema", "db_tables"],
  },
  {
    name: "image",
    label: "Image Analysis",
    description: "Image processing, OCR, and visual analysis capabilities",
    enabled: true,
    configured: true,
    tools: ["image_analyze", "image_ocr", "image_describe"],
  },
  {
    name: "memory",
    label: "Memory",
    description: "Persistent memory storage and retrieval across agent sessions",
    enabled: true,
    configured: true,
    tools: ["memory_store", "memory_search", "memory_list", "memory_delete"],
  },
];

// ---------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------

export const mockCronJobs: CronJob[] = [
  {
    id: "cron_daily_standup",
    name: "Daily standup summary",
    prompt: "Review yesterday's git commits, open PRs, and resolved issues. Write a concise standup summary with: what was done, what's in progress, and any blockers.",
    schedule: "0 9 * * *",
    status: "enabled",
    deliver: "discord",
    last_run_at: isoDate(daysAgo(0, 15)),
    next_run_at: isoDate(now + 6 * HOUR),
    error: null,
  },
  {
    id: "cron_weekly_metrics",
    name: "Weekly metrics report",
    prompt: "Generate a weekly metrics report including: total sessions, token usage, cost breakdown by model, most active days, and top 5 longest sessions. Format as a clean markdown table.",
    schedule: "0 8 * * 1",
    status: "enabled",
    deliver: "telegram",
    last_run_at: isoDate(daysAgo(3)),
    next_run_at: isoDate(now + 2 * DAY),
    error: null,
  },
  {
    id: "cron_nightly_backup",
    name: "Nightly backup check",
    prompt: "Verify that all database backups completed successfully. Check backup sizes, compare with previous day, and alert if any backup is missing or significantly smaller than expected.",
    schedule: "0 0 * * *",
    status: "paused",
    last_run_at: isoDate(daysAgo(5)),
    next_run_at: null,
    error: null,
  },
];

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

const logBase = new Date(now - 2 * HOUR);
function logTs(offsetMin: number): string {
  return new Date(logBase.getTime() + offsetMin * 60_000).toISOString().replace("T", " ").slice(0, 23);
}

export const mockLogs: LogsResponse = {
  file: "hermes.log",
  lines: [
    `${logTs(0)} INFO  [gateway] Gateway starting on port 9119`,
    `${logTs(0)} INFO  [gateway] Loading configuration v16`,
    `${logTs(1)} INFO  [gateway] Registered toolset: hermes-cli (6 tools)`,
    `${logTs(1)} INFO  [gateway] Registered toolset: browser (4 tools)`,
    `${logTs(1)} INFO  [gateway] Registered toolset: web-search (3 tools)`,
    `${logTs(1)} INFO  [gateway] Registered toolset: image (3 tools)`,
    `${logTs(1)} INFO  [gateway] Registered toolset: memory (4 tools)`,
    `${logTs(2)} INFO  [gateway] Connecting to Discord...`,
    `${logTs(3)} INFO  [discord] Bot authenticated as HermesAgent#4721`,
    `${logTs(3)} INFO  [discord] Connected to 3 guilds`,
    `${logTs(3)} INFO  [gateway] Connecting to Telegram...`,
    `${logTs(4)} INFO  [telegram] Bot authenticated as @hermes_agent_bot`,
    `${logTs(4)} INFO  [gateway] All platforms connected`,
    `${logTs(5)} INFO  [gateway] Gateway ready (PID 42891)`,
    `${logTs(10)} INFO  [session] New session sess_a1b2c3d4 from cli`,
    `${logTs(10)} INFO  [session] Model: anthropic/claude-opus-4-6`,
    `${logTs(12)} DEBUG [agent] Turn 1: user message (342 tokens)`,
    `${logTs(12)} DEBUG [agent] Turn 1: calling file_read("src/main.ts")`,
    `${logTs(13)} DEBUG [agent] Turn 1: tool result (128 tokens)`,
    `${logTs(14)} INFO  [agent] Turn 1 complete: 2,450 input / 380 output tokens`,
    `${logTs(20)} INFO  [session] New session sess_e5f6g7h8 from discord`,
    `${logTs(20)} INFO  [session] Model: anthropic/claude-sonnet-4-20250514`,
    `${logTs(22)} DEBUG [agent] Turn 1: user message (156 tokens)`,
    `${logTs(25)} WARN  [agent] Rate limit approaching: 85% of 1M tokens/min`,
    `${logTs(30)} INFO  [cron] Executing job: cron_daily_standup`,
    `${logTs(31)} INFO  [cron] Job cron_daily_standup completed in 45s`,
    `${logTs(45)} DEBUG [memory] Stored 3 memory entries for sess_a1b2c3d4`,
    `${logTs(60)} INFO  [agent] Session sess_a1b2c3d4: 47 messages, 18 tool calls`,
    `${logTs(90)} WARN  [gateway] Discord heartbeat delayed by 2.3s`,
    `${logTs(91)} INFO  [gateway] Discord heartbeat recovered`,
  ],
};

// ---------------------------------------------------------------------------
// Auth session token
// ---------------------------------------------------------------------------

export const mockSessionToken = { token: "mock-session-token-demo-2025" };

// ---------------------------------------------------------------------------
// Export the message factory
// ---------------------------------------------------------------------------

export { makeMessages };
