import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Info } from "lucide-react";

interface KiroAuthModalProps {
  isOpen: boolean;
  onConnect: (method: string, config?: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function KiroAuthModal({ isOpen, onConnect, onClose }: KiroAuthModalProps) {
  const [method, setMethod] = useState<"select" | "idc" | "import">("select");
  const [idcStartUrl, setIdcStartUrl] = useState("");
  const [idcRegion, setIdcRegion] = useState("us-east-1");
  const [importToken, setImportToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function handleClose() {
    setMethod("select");
    setIdcStartUrl("");
    setImportToken("");
    setError(null);
    onClose();
  }

  async function handleImport() {
    if (!importToken.trim()) {
      setError("Please enter a refresh token");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/kiro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: importToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      onConnect("import", { refreshToken: importToken.trim() });
      handleClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-lg font-bold">Connect Kiro AI</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* Method Selection */}
          {method === "select" && (
            <>
              <p className="text-sm text-[--on-surface-variant] mb-4">
                Choose an authentication method:
              </p>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => onConnect("builder-id")}
              >
                <span className="text-left">
                  <span className="block font-medium">AWS Builder ID</span>
                  <span className="block text-xs text-[--on-surface-variant]">
                    Device code flow — sign in with your AWS Builder ID
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => setMethod("idc")}
              >
                <span className="text-left">
                  <span className="block font-medium">AWS IAM Identity Center</span>
                  <span className="block text-xs text-[--on-surface-variant]">
                    Device code flow with custom SSO configuration
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => onConnect("google")}
              >
                <span className="text-left">
                  <span className="block font-medium">Google</span>
                  <span className="block text-xs text-[--on-surface-variant]">
                    Sign in with your Google account
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => onConnect("github")}
              >
                <span className="text-left">
                  <span className="block font-medium">GitHub</span>
                  <span className="block text-xs text-[--on-surface-variant]">
                    Sign in with your GitHub account
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => setMethod("import")}
              >
                <span className="text-left">
                  <span className="block font-medium">Import Token</span>
                  <span className="block text-xs text-[--on-surface-variant]">
                    Paste a refresh token from Kiro IDE
                  </span>
                </span>
              </Button>
            </>
          )}

          {/* IDC Config */}
          {method === "idc" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMethod("select")}
                className="mb-2"
              >
                ← Back
              </Button>
              <p className="text-sm text-[--on-surface-variant] mb-3">
                Enter your AWS IAM Identity Center start URL:
              </p>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                  Start URL
                </label>
                <Input
                  value={idcStartUrl}
                  onChange={(e) => setIdcStartUrl(e.target.value)}
                  placeholder="https://your-sso.awsapps.com/start"
                  className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                  Region
                </label>
                <select
                  value={idcRegion}
                  onChange={(e) => setIdcRegion(e.target.value)}
                  className="h-11 w-full px-3 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
                >
                  <option value="us-east-1">us-east-1</option>
                  <option value="us-west-2">us-west-2</option>
                  <option value="eu-west-1">eu-west-1</option>
                  <option value="eu-west-2">eu-west-2</option>
                  <option value="ap-southeast-1">ap-southeast-1</option>
                  <option value="ap-northeast-1">ap-northeast-1</option>
                </select>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button
                className="w-full bg-[#0F172A] text-white hover:bg-[#1e293b]"
                onClick={() => {
                  if (!idcStartUrl.trim()) {
                    setError("Start URL is required");
                    return;
                  }
                  onConnect("idc", { startUrl: idcStartUrl.trim(), region: idcRegion });
                  handleClose();
                }}
              >
                Continue
              </Button>
            </>
          )}

          {/* Import Token */}
          {method === "import" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMethod("select")}
                className="mb-2"
              >
                ← Back
              </Button>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Paste your refresh token from Kiro IDE. The token should start with{" "}
                    <code className="font-mono">aorAAAAAG</code>.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                  Refresh Token
                </Label>
                <textarea
                  value={importToken}
                  onChange={(e) => setImportToken(e.target.value)}
                  placeholder="aorAAAAAG..."
                  rows={3}
                  className="w-full px-3 py-2 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm font-mono resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button
                  className="w-full bg-[#0F172A] text-white hover:bg-[#1e293b]"
                  onClick={handleImport}
                  disabled={importing || !importToken.trim()}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {importing ? "Importing..." : "Import"}
                </Button>
                <Button variant="outline" onClick={() => setMethod("select")} className="w-full">
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
