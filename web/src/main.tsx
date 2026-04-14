import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { I18nProvider } from "./i18n";
import { PairingGate } from "./components/PairingGate";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <PairingGate>
      <App />
    </PairingGate>
  </I18nProvider>,
);
