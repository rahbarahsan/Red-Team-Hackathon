import React from "react";
import { createRoot } from "react-dom/client";
import "@gcds-core/components-react/gcds.css";
import "@gcds-core/css-shortcuts/dist/gcds-css-shortcuts.min.css";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
