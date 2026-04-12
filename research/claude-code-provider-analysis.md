# Claude Code (v1.0.48) Provider/Model Management Analysis

## Source: Reverse-engineered from minified npm package
Path: `~/.npm/_npx/0726791833487271/node_modules/@anthropic-ai/claude-code/cli.js`
Note: Claude Code is closed-source (distributed as minified JS). The anthropics/claude-code GitHub repo only contains plugins/examples, not source code.

---

## 1. Provider Registration/Configuration

### Three Providers
Claude Code supports exactly **three providers**, determined by environment variables:

```javascript
function G7() {
  return process.env.CLAUDE_CODE_USE_BEDROCK ? "bedrock"
       : process.env.CLAUDE_CODE_USE_VERTEX ? "vertex"
       : "firstParty"
}
function mH() { return G7() }  // alias used throughout
```

- `"firstParty"` - Direct Anthropic API (default)
- `"bedrock"` - AWS Bedrock
- `"vertex"` - Google Vertex AI

### No plugin/extension system for providers
Provider selection is a simple env-var-based switch. There's no provider registry pattern or abstract factory - it's hardcoded branching.

---

## 2. Model Catalog

### Model Name Mapping (per-provider)
Each model has three names - one per provider:

```javascript
var j_ = {  // Sonnet 3.7
  firstParty: "claude-3-7-sonnet-20250219",
  bedrock: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  vertex: "claude-3-7-sonnet@20250219"
}
var y_ = {  // Sonnet 3.5
  firstParty: "claude-3-5-sonnet-20241022",
  bedrock: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  vertex: "claude-3-5-sonnet-v2@20241022"
}
var ia = {  // Haiku 3.5
  firstParty: "claude-3-5-haiku-20241022",
  bedrock: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  vertex: "claude-3-5-haiku@20241022"
}
var DK = {  // Sonnet 4.0
  firstParty: "claude-sonnet-4-20250514",
  bedrock: "us.anthropic.claude-sonnet-4-20250514-v1:0",
  vertex: "claude-sonnet-4@20250514"
}
var mN = {  // Opus 4.0
  firstParty: "claude-opus-4-20250514",
  bedrock: "us.anthropic.claude-opus-4-20250514-v1:0",
  vertex: "claude-opus-4@20250514"
}
```

### Model Selection Function
Returns the right name for the current provider:

```javascript
return {
  haiku35: ia[provider],
  sonnet35: y_[provider],
  sonnet37: j_[provider],
  sonnet40: DK[provider],
  opus40: mN[provider]
}
```

### Bedrock Model Override
For Bedrock, there's a fallback that allows custom model names:

```javascript
return {
  haiku35: B || ia.bedrock,
  sonnet35: Q || y_.bedrock,
  sonnet37: D || j_.bedrock,
  sonnet40: I || DK.bedrock,
  opus40: Z || mN.bedrock
}
```

---

## 3. Context Length Management

### Max Output Tokens
- Default: **32000** tokens
- Configurable via `CLAUDE_CODE_MAX_OUTPUT_TOKENS` env var
- Hardcoded minimum of 512 and maximum of 128000 implied by streaming timeout

```javascript
// Max output tokens resolution:
let B = process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
if (B) {
  let Q = parseInt(B, 10);
  if (!isNaN(Q) && Q > 0) return Q;
}
return 32000;
```

### Token Budget Constants
- `pq6 = 21333` - likely a token budget for some operation
- `oF6 = 30000` - another token-related threshold

### Streaming Timeout Based on Token Count
Claude Code calculates if an operation will take >10 minutes based on tokens:

```javascript
// Throws if 3600000 * max_tokens / 128000 > 600000
// i.e., if max_tokens * 3600/128 > 600 seconds
streamingTimeout(max_tokens, threshold) {
  if (3600000 * max_tokens / 128000 > 600000 || threshold != null && max_tokens > threshold)
    throw new Error("Streaming is strongly recommended for operations that may take longer than 10 minutes")
}
```

---

## 4. API Keys and Base URLs

### API Key Resolution
```javascript
apiKey: B = Ke("ANTHROPIC_API_KEY")
// Also checks:
// ANTHROPIC_AUTH_TOKEN (OAuth token)
// CLAUDE_CODE_OAUTH_TOKEN
```

### Base URL Resolution
```javascript
// First-party:
baseURL: A = Ke("ANTHROPIC_BASE_URL")
// Falls back to:
baseURL: A || "https://api.anthropic.com"

// Vertex:
baseURL: A = jE1("ANTHROPIC_VERTEX_BASE_URL")
// Falls back to:
baseURL: A || `https://${region}-aiplatform.googleapis.com/v1`

// Bedrock:
baseURL: `https://bedrock-runtime.${region}.amazonaws.com`
// With env var: ANTHROPIC_BEDROCK_BASE_URL
```

### Cloud Provider Auth
- **Bedrock**: `AWS_REGION` env var + standard AWS credential chain (access key, secret key, session token)
- **Vertex**: `ANTHROPIC_VERTEX_PROJECT_ID` env var + Google credentials

---

## 5. Error Handling

### Retry Configuration
```javascript
var jq6 = 10;     // max retries for some operations
var j0A = 3000;   // delay between retries (3s)
var yq6 = 3;      // default retry count
var kq6 = 500;    // base exponential backoff (500ms)
```

### Exponential Backoff
```javascript
function xq6(attempt, retryHeader) {
  if (retryHeader) {
    let seconds = parseInt(retryHeader, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  let base = Math.min(kq6 * Math.pow(2, attempt - 1), 32000);
  let jitter = Math.random() * 0.25 * base;
  return base + jitter;
}
```
- Respects `Retry-After` header
- Exponential backoff: 500ms, 1s, 2s, 4s... capped at 32s
- 25% random jitter

### Model Fallback on Overload (HTTP 529)
```javascript
class Uz1 extends Error {
  originalModel;
  fallbackModel;
  constructor(A, B) {
    super(`Model fallback triggered: ${A} -> ${B}`)
  }
}
// Triggers fallback to a different model when 529 (overloaded) occurs
// Logged as "tengu_model_fallback_triggered"
```

### Error Classes
- `yT` - API error with retries exhausted
- `D6` - HTTP status error (has `.status` property)
- `gB` - Streaming timeout error
- `Uz1` - Model fallback triggered error

---

## 6. Streaming vs Non-Streaming

### Default: Streaming
Claude Code defaults to streaming for all API calls.

### Non-Streaming Fallback
There's a `didFallBackToNonStreaming` flag tracked throughout:
- When streaming fails, it can fall back to non-streaming
- This is tracked in telemetry events
- The flag propagates through success/error logging

### Streaming Timeout Guard
Before making a non-streaming call, Claude Code checks if the estimated time exceeds 10 minutes (based on `max_tokens / 128000 * 3600s`). If so, it throws an error requiring streaming.

### Timeout Configuration
```javascript
// Default API timeout: 600000ms (10 minutes)
timeout: Q ?? 600000
```

---

## 7. Model Normalization/Aliasing

### Short Name Extraction
```javascript
function RK(modelName) {
  let match = modelName.match(/(claude-(\d+-\d+-)?\w+)/);
  if (match && match[1]) return match[1];
  return modelName;
}
```
This extracts the canonical model name from various formats:
- `"us.anthropic.claude-3-7-sonnet-20250219-v1:0"` → `"claude-3-7-sonnet-20250219"`
- `"claude-3-7-sonnet@20250219"` → `"claude-3-7-sonnet"`

### Model Override
Users can override via `ANTHROPIC_MODEL` env var or settings file:
```javascript
let model = I.model || process.env.ANTHROPIC_MODEL || jQ().model;
```

### Deprecation Tracking
```javascript
var pe0 = {
  "claude-1.3": "November 6th, 2024",
  "claude-1.3-100k": "November 6th, 2024",
  "claude-instant-1.1": "November 6th, 2024",
  "claude-instant-1.1-100k": "November 6th, 2024",
  "claude-instant-1.2": "November 6th, 2024",
  "claude-3-sonnet-20240229": "July 21st, 2025",
  "claude-2.1": "July 21st, 2025",
  "claude-2.0": "July 21st, 2025"
}
```

---

## 8. Provider-Specific Quirks

### Bedrock
- Uses AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`)
- Full AWS credential chain (env vars, profiles, IAM roles, IMDS, ECS container credentials)
- Model names use `us.anthropic.` prefix and `-v1:0` suffix
- Region auto-detected from `AWS_REGION`
- Handles Bedrock-specific errors: `ModelErrorException`, `ModelNotReadyException`, `ModelStreamErrorException`, `ModelTimeoutException`, `ThrottlingException`
- Custom headers: `x-amzn-bedrock-accept`, `x-amzn-bedrock-content-type`, etc.
- Request signing with SigV4

### Vertex
- Uses Google Auth libraries for credential resolution
- Model names use `@` separator: `claude-sonnet-4@20250514`
- Base URL pattern: `https://{region}-aiplatform.googleapis.com/v1`
- Project ID from `ANTHROPIC_VERTEX_PROJECT_ID` or auto-resolved from credentials
- API version: `vertex-2023-10-16`

### First-Party (Direct Anthropic)
- Standard API key auth via `X-Api-Key` header or `Authorization: Bearer` with OAuth
- Beta features via `anthropic-beta` header
- Base URL default: `https://api.anthropic.com`
- Uses `/v1/messages` endpoint (and `/v1/messages?beta=true` for beta features)
- Token counting endpoint: `/v1/messages/count_tokens`

### Telemetry/Feature Gating
- Bedrock and Vertex users get telemetry disabled: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
- OAuth/subscription features (`claude_pro`, `claude_max`, `claude_team`, `claude_enterprise`) only for first-party

---

## 9. Cost Tracking

### Per-Model Pricing (USD per million tokens)
```javascript
var zO2 = {
  // Haiku 3.5
  "claude-3-5-haiku": { inputTokens: 0.8, outputTokens: 4, promptCacheWriteTokens: 1, promptCacheReadTokens: 0.08, webSearchRequests: 0.01 },
  // Sonnet 3.5
  "claude-3-5-sonnet": { inputTokens: 3, outputTokens: 15, promptCacheWriteTokens: 3.75, promptCacheReadTokens: 0.3, webSearchRequests: 0.01 },
  // Sonnet 3.7
  "claude-3-7-sonnet": { inputTokens: 3, outputTokens: 15, promptCacheWriteTokens: 3.75, promptCacheReadTokens: 0.3, webSearchRequests: 0.01 },
  // Opus 4.0
  "claude-opus-4": { inputTokens: 15, outputTokens: 75, promptCacheWriteTokens: 18.75, promptCacheReadTokens: 1.5, webSearchRequests: 0.01 },
  // Sonnet 4.0
  "claude-sonnet-4": { inputTokens: 3, outputTokens: 15, promptCacheWriteTokens: 3.75, promptCacheReadTokens: 0.3, webSearchRequests: 0.01 },
}

// Batch discount:
var Tq6 = {
  inputTokens: -0.9,
  outputTokens: 0,
  promptCacheReadTokens: -0.09,
  promptCacheWriteTokens: -1.125,
  webSearchRequests: 0
}
```

---

## Key Takeaways for Hermes Agent

1. **Simple provider model**: Claude Code only supports 3 providers (Anthropic, Bedrock, Vertex) - all Anthropic endpoints. No support for OpenAI, Ollama, or other providers.

2. **Model catalog is static**: Hardcoded model names per provider, no dynamic discovery. Model names differ by provider format.

3. **Model normalization via regex**: `RK()` function extracts canonical model name from provider-specific formats.

4. **Env-var-driven configuration**: Almost everything configurable via environment variables (provider selection, API keys, base URLs, model override, max tokens).

5. **Retry with exponential backoff + jitter**: Standard pattern with 500ms base, 32s cap, 25% jitter, respects `Retry-After`.

6. **Model fallback on 529**: Automatically switches to a different model when the primary is overloaded.

7. **Streaming-first with fallback**: Always tries streaming, tracks when fallback to non-streaming occurs.

8. **Cost tracking built-in**: Per-model pricing table with cache-aware billing.

9. **No multi-provider abstraction**: Unlike Hermes which needs to support OpenAI, Anthropic, OpenRouter, Ollama etc., Claude Code only talks to Anthropic-compatible APIs. The "provider" concept is really just "which Anthropic endpoint".
