import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./lib/auth.tsx";
import App from "./App.tsx";
import { Toaster } from "sonner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster position='top-right' richColors />
    </AuthProvider>
  </React.StrictMode>,
);
