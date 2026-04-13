import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { setupMockApi } from "./lib/mock-api";
import App from "./App";

// Activate mock API on GitHub Pages or when ?demo param is present
if (
  location.hostname.includes("github.io") ||
  new URLSearchParams(location.search).has("demo")
) {
  setupMockApi();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
