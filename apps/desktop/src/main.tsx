import React from "react";
import ReactDOM from "react-dom/client";
import { installCrashReporting } from "./lib/crashReporting";
import ErrorBoundary from "./ui/components/ErrorBoundary";
import App from "./ui/index";

installCrashReporting();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="h-screen w-screen">
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  </React.StrictMode>
);
