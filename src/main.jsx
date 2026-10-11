// Must stay the first import: it starts listening for the browser's install
// event before anything else runs, so the event can never be missed.
import "./utils/pwaInstall";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/variables.css";
import "./styles/globals.css";
import "./styles/loading.css";
import "./styles/feed.css";
import "./styles/composer.css";
import "./styles/shell.css";
import "./styles/shell-pages.css";
import "./styles/forms.css";
import "./styles/auth.css";
// Must follow the legacy shell rules: it aligns the left rail, center navbar,
// and persistent right Explore rail on desktop.
import "./styles/desktop-alignment.css";
// Final desktop pass: one continuous canvas across the left rail, center
// navbar/feed and right Explore rail, with a shared type scale.
import "./styles/desktop-layout.css";
// Provides the active signup-consent styling and legal-page layout/scroll rules.
import "./styles/legal-consent.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
