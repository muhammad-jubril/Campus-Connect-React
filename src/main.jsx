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
// and persistent right Explore rail on desktop widths.
import "./styles/desktop-alignment.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
