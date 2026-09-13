import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/index";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="h-screen w-screen">
      <App />
    </div>
  </React.StrictMode>
);
