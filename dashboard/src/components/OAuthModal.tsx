import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";

// ─── Device Code Providers ──────────────────────────────────────────────────────
const DEVICE_CODE_PROVIDERS = new Set(["qwen", "kiro"]);

interface OAuthModalProps {
  isOpen: boolean;
  provider: string;
  providerName: string;
  /** For Kiro: pass extra data like _clientId, _clientSecret */
  oauthMeta?: Record<string, unknown>;
  onSuccess: () => void;
  onClose: () => void;
}

type Step = "loading" | "device_code" | "waiting" | "input" | "success" | "error";

export default function OAuthModal({
  isOpen,
  provider,
  providerName,
  oauthMeta,
  onSuccess,
  onClose,
}: OAuthModalProps) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);

  // Device code state
  const [deviceData, setDeviceData] = useState<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    interval: number;
    codeVerifier: string;
    [key: string]: unknown;
  } | null>(null);
  const [polling, setPolling] = useState(false);

  // Auth code state
  const [authData, setAuthData] = useState<{
    authUrl: string;
    state: string;
    codeVerifier: string;
    redirectUri: string;
  } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const pollingRef = useRef(false);
  const callbackProcessedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);

  const isDeviceCode = DEVICE_CODE_PROVIDERS.has(provider);
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // ─── Copy helper ──────────────────────────────────────────────────────────────
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  // ─── Get auth token helper ───────────────────────────────────────────────────────
  function getAuthHeaders() {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  // ─── Start OAuth Flow ─────────────────────────────────────────────────────────
  const startFlow = useCallback(async () => {
    if (!provider) return;
    setError(null);
    setStep("loading");

    try {
      if (isDeviceCode) {
        // Device code flow
        const res = await fetch(`/api/oauth/${provider}/device-code`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(oauthMeta || {}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to get device code");

        setDeviceData(data);
        setStep("device_code");

        // Open verification URL
        const verifyUrl = data.verification_uri_complete || data.verification_uri;
        if (verifyUrl) window.open(verifyUrl, "_blank");

        // Start polling
        startPolling(data.device_code, data.codeVerifier, data.interval || 5, data);
      } else {
        // Authorization code flow
        const res = await fetch(`/api/oauth/${provider}/authorize?redirect_uri=${encodeURIComponent(`${window.location.origin}/oauth/callback`)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to get auth URL");

        setAuthData(data);

        if (isLocalhost) {
          // Open popup
          setStep("waiting");
          popupRef.current = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
          if (!popupRef.current) {
            // Popup blocked, use manual input
            setStep("input");
            window.open(data.authUrl, "_blank");
          }
        } else {
          // Remote: manual input mode
          setStep("input");
          window.open(data.authUrl, "_blank");
        }
      }
    } catch (err: any) {
      setError(err.message);
      setStep("error");
    }
  }, [provider, isDeviceCode, isLocalhost, oauthMeta]);

  // ─── Polling ──────────────────────────────────────────────────────────────────
  const startPolling = useCallback(
    (deviceCode: string, codeVerifier: string, interval: number, extraData: Record<string, unknown>) => {
      pollingRef.current = false;
      setPolling(true);

      const poll = async () => {
        const maxAttempts = 60;
        let currentInterval = interval;

        for (let i = 0; i < maxAttempts; i++) {
          if (pollingRef.current) {
            setPolling(false);
            return;
          }

          await new Promise((r) => setTimeout(r, currentInterval * 1000));

          if (pollingRef.current) {
            setPolling(false);
            return;
          }

          try {
            const res = await fetch(`/api/oauth/${provider}/poll`, {
              method: "POST",
              headers: getAuthHeaders(),
              body: JSON.stringify({ deviceCode, codeVerifier, extraData }),
            });
            const data = await res.json();

            if (data.success) {
              pollingRef.current = true;
              setStep("success");
              setPolling(false);
              onSuccess();
              return;
            }

            if (data.error === "expired_token" || data.error === "access_denied") {
              throw new Error(data.errorDescription || data.error);
            }

            if (data.error === "slow_down") {
              currentInterval = Math.min(currentInterval + 5, 30);
            }
          } catch (err: any) {
            pollingRef.current = true;
            setError(err.message);
            setStep("error");
            setPolling(false);
            return;
          }
        }

        setError("Authorization timeout");
        setStep("error");
        setPolling(false);
      };

      poll();
    },
    [provider, onSuccess]
  );

  // ─── Exchange tokens (auth code flow) ─────────────────────────────────────────
  const exchangeTokens = useCallback(
    async (code: string, state?: string) => {
      if (!authData) return;
      try {
        const res = await fetch(`/api/oauth/${provider}/exchange`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            code,
            redirectUri: authData.redirectUri,
            codeVerifier: authData.codeVerifier,
            state,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Exchange failed");

        setStep("success");
        onSuccess();
      } catch (err: any) {
        setError(err.message);
        setStep("error");
      }
    },
    [authData, provider, onSuccess]
  );

  // ─── Listen for OAuth callback (popup / localStorage) ─────────────────────────
  useEffect(() => {
    if (!authData) return;
    callbackProcessedRef.current = false;

    const handleCallback = async (data: { code?: string; state?: string; error?: string; errorDescription?: string }) => {
      if (callbackProcessedRef.current) return;
      if (data.error) {
        callbackProcessedRef.current = true;
        setError(data.errorDescription || data.error);
        setStep("error");
        return;
      }
      if (data.code) {
        callbackProcessedRef.current = true;
        await exchangeTokens(data.code, data.state);
      }
    };

    // postMessage
    const handleMessage = (event: MessageEvent) => {
      const isLocal = event.origin.includes("localhost") || event.origin.includes("127.0.0.1");
      const isSame = event.origin === window.location.origin;
      if (!isLocal && !isSame) return;
      if (event.data?.type === "oauth_callback") {
        handleCallback(event.data.data);
      }
    };
    window.addEventListener("message", handleMessage);

    // BroadcastChannel
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("oauth_callback");
      channel.onmessage = (event) => handleCallback(event.data);
    } catch {}

    // localStorage
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "oauth_callback" && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          handleCallback(data);
          localStorage.removeItem("oauth_callback");
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);

    // Check localStorage on mount
    try {
      const stored = localStorage.getItem("oauth_callback");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.timestamp && Date.now() - data.timestamp < 30000) {
          handleCallback(data);
        }
        localStorage.removeItem("oauth_callback");
      }
    } catch {}

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (channel) channel.close();
    };
  }, [authData, exchangeTokens]);

  // ─── Start flow when modal opens ──────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && provider) {
      setDeviceData(null);
      setAuthData(null);
      setCallbackUrl("");
      setError(null);
      setPolling(false);
      pollingRef.current = false;
      callbackProcessedRef.current = false;
      startFlow();
    } else if (!isOpen) {
      pollingRef.current = true;
    }
  }, [isOpen, provider]);

  // ─── Manual callback URL submit ───────────────────────────────────────────────
  const handleManualSubmit = async () => {
    try {
      setError(null);
      const url = new URL(callbackUrl);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) throw new Error(url.searchParams.get("error_description") || errorParam);
      if (!code) throw new Error("No authorization code found in URL");

      await exchangeTokens(code, state || undefined);
    } catch (err: any) {
      setError(err.message);
      setStep("error");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">
            Connect {providerName}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-[--primary]" />
              <p className="text-sm text-[--on-surface-variant]">Starting OAuth flow...</p>
            </div>
          )}

          {/* Device Code */}
          {step === "device_code" && deviceData && (
            <div className="space-y-4">
              <p className="text-sm text-[--on-surface-variant]">
                Visit the URL below and enter the code:
              </p>

              {/* Verification URL */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[--surface-container-low] border border-[rgba(203,213,225,0.4)]">
                <code className="text-xs font-mono text-[--primary] flex-1 break-all">
                  {deviceData.verification_uri}
                </code>
                <button onClick={() => handleCopy(deviceData.verification_uri)} className="shrink-0 text-[--on-surface-variant] hover:text-[--on-surface]">
                  {copied === deviceData.verification_uri ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              {/* User Code */}
              <div className="text-center py-3 rounded-lg bg-[--surface-container-low] border border-[rgba(203,213,225,0.4)]">
                <p className="text-xs text-[--on-surface-variant] mb-1">Your code</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-[--on-surface]">
                  {deviceData.user_code}
                </p>
              </div>

              {/* Open URL button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const url = deviceData.verification_uri_complete || deviceData.verification_uri;
                  if (url) window.open(url, "_blank");
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Open Verification URL
              </Button>

              {/* Polling indicator */}
              {polling && (
                <div className="flex items-center justify-center gap-2 text-sm text-[--on-surface-variant]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for authorization...
                </div>
              )}
            </div>
          )}

          {/* Waiting for callback */}
          {step === "waiting" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-[--primary]" />
              <p className="text-sm text-[--on-surface-variant]">
                Waiting for authorization in popup...
              </p>
              <Button variant="outline" size="sm" onClick={() => { setStep("input"); }}>
                Paste callback URL manually
              </Button>
            </div>
          )}

          {/* Manual callback input */}
          {step === "input" && authData && (
            <div className="space-y-4">
              <p className="text-sm text-[--on-surface-variant]">
                After authorizing, paste the full callback URL here:
              </p>

              {/* Auth URL for reference */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[--surface-container-low] border border-[rgba(203,213,225,0.4)]">
                <code className="text-[10px] font-mono text-[--on-surface-variant] flex-1 break-all line-clamp-2">
                  {authData.authUrl}
                </code>
                <button onClick={() => handleCopy(authData.authUrl)} className="shrink-0">
                  {copied === authData.authUrl ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-[--on-surface-variant]" />}
                </button>
              </div>

              <Button variant="outline" className="w-full text-xs" onClick={() => window.open(authData.authUrl, "_blank")}>
                <ExternalLink className="w-4 h-4 mr-2" /> Open Authorization URL
              </Button>

              <Input
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder={`${window.location.origin}/oauth/callback?code=...`}
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm font-mono"
              />

              <Button className="w-full bg-[#0F172A] text-white hover:bg-[#1e293b]" onClick={handleManualSubmit} disabled={!callbackUrl.trim()}>
                Submit
              </Button>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-[--on-surface]">Connected successfully!</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && error && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <span className="text-red-500 text-xl">!</span>
              </div>
              <p className="text-sm text-red-500 text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={startFlow}>
                Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}