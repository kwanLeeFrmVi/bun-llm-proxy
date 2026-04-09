import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./lib/auth.tsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App.tsx";
import { Toaster } from "sonner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <AuthProvider>
        <App />
        <Toaster position='top-right' richColors />
      </AuthProvider>
    </TooltipProvider>
  </React.StrictMode>,
);
