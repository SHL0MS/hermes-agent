// Mock API interceptor for GitHub Pages demo / ?demo mode
// Overrides window.fetch to intercept /api/* requests and return mock data

import {
  mockStatus,
  mockSessions,
  mockAnalytics,
  mockConfig,
  mockDefaults,
  mockSchema,
  mockConfigRaw,
  mockEnvVars,
  mockSkills,
  mockToolsets,
  mockCronJobs,
  mockLogs,
  mockSessionToken,
  makeMessages,
} from "./mock-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function delay(min = 50, max = 200): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

type RouteHandler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

const routes: Array<{ pattern: RegExp; method?: string; handler: RouteHandler }> = [
  // Auth
  {
    pattern: /^\/api\/auth\/session-token$/,
    handler: () => jsonResponse(mockSessionToken),
  },

  // Status
  {
    pattern: /^\/api\/status$/,
    handler: () => jsonResponse(mockStatus),
  },

  // Sessions list
  {
    pattern: /^\/api\/sessions$/,
    method: "GET",
    handler: () => jsonResponse(mockSessions),
  },

  // Session messages
  {
    pattern: /^\/api\/sessions\/([^/]+)\/messages$/,
    handler: (url) => {
      const match = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      const id = match ? decodeURIComponent(match[1]) : "";
      return jsonResponse(makeMessages(id));
    },
  },

  // Delete session
  {
    pattern: /^\/api\/sessions\/([^/]+)$/,
    method: "DELETE",
    handler: () => jsonResponse({ ok: true }),
  },

  // Analytics
  {
    pattern: /^\/api\/analytics\/usage/,
    handler: () => jsonResponse(mockAnalytics),
  },

  // Config
  {
    pattern: /^\/api\/config\/schema$/,
    handler: () => jsonResponse(mockSchema),
  },
  {
    pattern: /^\/api\/config\/defaults$/,
    handler: () => jsonResponse(mockDefaults),
  },
  {
    pattern: /^\/api\/config\/raw$/,
    method: "GET",
    handler: () => jsonResponse({ yaml: mockConfigRaw }),
  },
  {
    pattern: /^\/api\/config\/raw$/,
    method: "PUT",
    handler: () => jsonResponse({ ok: true }),
  },
  {
    pattern: /^\/api\/config$/,
    method: "GET",
    handler: () => jsonResponse(mockConfig),
  },
  {
    pattern: /^\/api\/config$/,
    method: "PUT",
    handler: () => jsonResponse({ ok: true }),
  },

  // Env vars
  {
    pattern: /^\/api\/env\/reveal$/,
    method: "POST",
    handler: (_url, init) => {
      try {
        const body = JSON.parse((init?.body as string) ?? "{}");
        return jsonResponse({ key: body.key, value: "demo-value-hidden-in-demo-mode" });
      } catch {
        return jsonResponse({ key: "unknown", value: "demo-value" });
      }
    },
  },
  {
    pattern: /^\/api\/env$/,
    method: "GET",
    handler: () => jsonResponse(mockEnvVars),
  },
  {
    pattern: /^\/api\/env$/,
    method: "PUT",
    handler: () => jsonResponse({ ok: true }),
  },
  {
    pattern: /^\/api\/env$/,
    method: "DELETE",
    handler: () => jsonResponse({ ok: true }),
  },

  // Skills
  {
    pattern: /^\/api\/skills\/toggle$/,
    method: "PUT",
    handler: () => jsonResponse({ ok: true }),
  },
  {
    pattern: /^\/api\/skills$/,
    handler: () => jsonResponse(mockSkills),
  },

  // Toolsets
  {
    pattern: /^\/api\/tools\/toolsets$/,
    handler: () => jsonResponse(mockToolsets),
  },

  // Cron jobs
  {
    pattern: /^\/api\/cron\/jobs\/([^/]+)\/(pause|resume|trigger)$/,
    method: "POST",
    handler: () => jsonResponse({ ok: true }),
  },
  {
    pattern: /^\/api\/cron\/jobs\/([^/]+)$/,
    method: "DELETE",
    handler: () => jsonResponse({ ok: true }),
  },
  {
    pattern: /^\/api\/cron\/jobs$/,
    method: "POST",
    handler: () =>
      jsonResponse({
        id: "cron_new_" + Date.now(),
        name: "New Job",
        prompt: "...",
        schedule: "0 * * * *",
        status: "enabled",
        last_run_at: null,
        next_run_at: new Date(Date.now() + 3600_000).toISOString(),
        error: null,
      }),
  },
  {
    pattern: /^\/api\/cron\/jobs$/,
    method: "GET",
    handler: () => jsonResponse(mockCronJobs),
  },

  // Logs
  {
    pattern: /^\/api\/logs/,
    handler: () => jsonResponse(mockLogs),
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupMockApi(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Normalise to a URL string
    let urlStr: string;
    if (input instanceof Request) {
      urlStr = input.url;
      init = init ?? {
        method: input.method,
        headers: input.headers,
        body: input.body,
      };
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else {
      urlStr = input;
    }

    // Only intercept /api/* paths
    let url: URL;
    try {
      url = new URL(urlStr, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    if (!url.pathname.startsWith("/api/") && !url.pathname.match(/^\/[^/]+\/api\//)) {
      return originalFetch(input, init);
    }

    // Normalise pathname: strip base prefix (e.g. /hermes-agent/api/... -> /api/...)
    let pathname = url.pathname;
    const baseMatch = pathname.match(/^\/[^/]+?(\/api\/.*)$/);
    if (baseMatch) {
      pathname = baseMatch[1];
    }
    const normalised = new URL(pathname + url.search, window.location.origin);

    const method = (init?.method ?? "GET").toUpperCase();

    // Find matching route
    for (const route of routes) {
      if (route.pattern.test(normalised.pathname)) {
        if (route.method && route.method !== method) continue;
        await delay();
        return route.handler(normalised, init);
      }
    }

    // Fallback: 404 for unmatched API routes
    console.warn(`[mock-api] No handler for ${method} ${pathname}`);
    await delay();
    return new Response(JSON.stringify({ error: "Not found (demo mode)" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };

  console.log(
    "%c[Hermes Agent] Demo mode active — all API calls return mock data",
    "color: #4ade80; font-weight: bold;",
  );
}
