import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export default function OAuthCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    const callbackData = error
      ? { error, errorDescription: errorDescription || error }
      : { code, state };

    // Send to opener via BroadcastChannel + localStorage
    try {
      const channel = new BroadcastChannel("oauth_callback");
      channel.postMessage({ ...callbackData, timestamp: Date.now() });
      channel.close();
    } catch {}

    // Also set in localStorage for cross-tab
    try {
      localStorage.setItem("oauth_callback", JSON.stringify({ ...callbackData, timestamp: Date.now() }));
    } catch {}

    // Try postMessage to opener
    if (window.opener) {
      window.opener.postMessage({ type: "oauth_callback", data: callbackData }, "*");
    }

    if (error) {
      setErrorMsg(errorDescription || error);
      setStatus("error");
    } else {
      setStatus("success");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--surface-container-low]">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full mx-4 text-center border border-[rgba(203,213,225,0.4)]">
        {status === "loading" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[--surface-container-low] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[--primary] border-t-transparent rounded-full animate-spin" />
            </div>
            <h1 className="text-lg font-headline font-bold text-[--on-surface] mb-2">Processing...</h1>
            <p className="text-sm text-[--on-surface-variant]">Completing authorization, please wait.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-lg font-headline font-bold text-[--on-surface] mb-2">Authorization Successful!</h1>
            <p className="text-sm text-[--on-surface-variant]">You can close this tab and return to the dashboard.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
              <span className="text-red-500 text-3xl font-bold">!</span>
            </div>
            <h1 className="text-lg font-headline font-bold text-[--on-surface] mb-2">Authorization Failed</h1>
            <p className="text-sm text-red-500">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}
