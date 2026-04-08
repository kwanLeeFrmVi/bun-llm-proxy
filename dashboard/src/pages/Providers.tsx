import { useState, useEffect } from "react";
import { api } from "@/lib/api.ts";
import { Plus, Search, Star, Copy, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProviderConnection } from "@/lib/types.ts";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a574",
  google: "#4285f4",
  azure: "#0078d4",
  ollama: "#8b5cf6",
  groq: "#f97316",
  Claude: "#3b82f6",
};

function getProviderColor(p: string) {
  return PROVIDER_COLORS[p.toLowerCase()] ?? "#64748b";
}

function getInitials(provider: string) {
  return provider.slice(0, 2).toUpperCase();
}

function ProviderAvatar({ provider }: { provider: string }) {
  const color = getProviderColor(provider);
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-[10px] text-white shrink-0"
      style={{ backgroundColor: color }}
    >
      {getInitials(provider)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  if (priority <= 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
        <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Primary
      </span>
    );
  }
  if (priority <= 10) {
    return (
      <span className="text-[11px] text-[--on-surface-variant] font-medium">Secondary</span>
    );
  }
  return (
    <span className="text-[11px] text-[--on-surface-variant] font-medium">Failover</span>
  );
}

const cardStyle = "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";
const cardHeaderStyle = "px-6 py-4 border-b border-[rgba(203,213,225,0.4)]";
const primaryBtnStyle = "h-10 px-5 rounded font-semibold text-[14px] tracking-wide bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors duration-150";

export default function Providers() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ProviderConnection | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    provider: "",
    apiKey: "",
    baseUrl: "",
    priority: "100",
  });

  async function load() {
    setLoading(true);
    try {
      const data = (await api.providers.list()) as {
        connections: ProviderConnection[];
      };
      setConnections(data.connections);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    const payload: Record<string, unknown> = {
      provider: form.provider,
      priority: parseInt(form.priority),
    };
    if (form.apiKey) payload.apiKey = form.apiKey;
    if (form.baseUrl) payload.baseUrl = form.baseUrl;

    try {
      if (editing) {
        await api.providers.update(editing.id, payload);
        toast.success("Provider updated");
      } else {
        await api.providers.create(payload);
        toast.success("Provider created");
      }
      setShowModal(false);
      setEditing(null);
      setForm({ provider: "", apiKey: "", baseUrl: "", priority: "100" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleToggle(conn: ProviderConnection) {
    try {
      await api.providers.update(conn.id, { isActive: !conn.isActive });
      toast.success(conn.isActive ? "Provider disabled" : "Provider enabled");
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Toggle failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this provider?")) return;
    try {
      await api.providers.remove(id);
      toast.success("Provider deleted");
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  }

  function openEdit(conn: ProviderConnection) {
    setEditing(conn);
    setForm({
      provider: conn.provider ?? "",
      apiKey: (conn.apiKey as string) ?? "",
      baseUrl: (conn.baseUrl as string) ?? "",
      priority: String(conn.priority ?? 100),
    });
    setShowModal(true);
  }

  const filtered = connections.filter((c) =>
    c.provider?.toLowerCase().includes(search.toLowerCase()),
  );

  const total = connections.length;
  const active = connections.filter((c) => c.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight text-[--on-surface]">
          Providers
        </h1>
        <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1.5 font-medium">
          Manage and orchestrate LLM endpoint connections across your infrastructure.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Providers
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {total}
          </p>
          <p className="text-xs text-[--primary] mt-1">+2 this month</p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Active Providers
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {active}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">
            {total > 0 ? Math.round((active / total) * 100) : 0}% utilization
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            System Health
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            99.9%
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">Average Latency: 240ms</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Action Bar + Table */}
      <div className={cardStyle}>
        {/* Table Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(203,213,225,0.4)]">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--on-surface-variant]" />
              <Input
                placeholder="Search providers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-64 bg-[--surface-container-low] border border-[rgba(203,213,225,0.6)] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
          </div>
          <Button
            className={primaryBtnStyle}
            onClick={() => {
              setEditing(null);
              setForm({ provider: "", apiKey: "", baseUrl: "", priority: "100" });
              setShowModal(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Provider
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">No providers found.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setShowModal(true)}
            >
              Add your first provider
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 pl-6">
                    Provider
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                    Endpoint
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                    API Key
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                    Priority
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                    Status
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 pr-6 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c, i) => (
                  <TableRow
                    key={c.id}
                    className={
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                      (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                    }
                  >
                    {/* Provider */}
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <ProviderAvatar provider={c.provider ?? "?"} />
                        <div>
                          <p className="text-sm font-semibold text-[--on-surface] capitalize">
                            {c.provider}
                          </p>
                          <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
                            {c.baseUrl ? String(c.baseUrl) : `${c.provider}.com`}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Endpoint */}
                    <TableCell>
                      <Badge className="bg-[--primary-fixed-dim] text-[--on-primary-fixed] font-normal text-[12px] px-2.5 py-0.5 rounded-full">
                        {String(c.baseUrl ?? c.provider ?? "").replace(/^https?:\/\//, "").split("/")[0] || c.provider}
                      </Badge>
                    </TableCell>

                    {/* API Key */}
                    <TableCell>
                      {c.apiKey ? (
                        <span className="font-mono text-[12px] text-[--on-surface-variant]">
                          {"sk_••••••" + String(c.apiKey).slice(-4)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-red-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                          Expired
                        </span>
                      )}
                    </TableCell>

                    {/* Priority */}
                    <TableCell>
                      <PriorityBadge priority={Number(c.priority ?? 100)} />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Switch
                        checked={!!c.isActive}
                        onCheckedChange={() => handleToggle(c)}
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-[--surface-container-low]"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-[--on-surface-variant]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-50"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Table Footer */}
            <div className="px-6 py-3 border-t border-[rgba(203,213,225,0.4)] flex items-center justify-between">
              <p className="text-[11px] text-[--on-surface-variant] font-medium tracking-wide">
                SHOWING {filtered.length} OF {connections.length} PROVIDERS
              </p>
              <div className="flex items-center gap-2">
                <button className="text-[11px] text-[--on-surface-variant] hover:text-[--on-surface] font-medium px-2 py-1 rounded transition-colors disabled:opacity-40" disabled>
                  Previous
                </button>
                <button className="text-[11px] text-[--on-surface-variant] hover:text-[--on-surface] font-medium px-2 py-1 rounded transition-colors disabled:opacity-40" disabled>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Integration Panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Quick Integration */}
        <div className={cardStyle}>
          <div className={cardHeaderStyle}>
            <p className="text-sm font-semibold text-[--on-surface]">Quick Integration</p>
            <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
              Start using this provider in minutes
            </p>
          </div>
          <div className="p-4">
            <div className="bg-[#0F172A] rounded-lg p-4 font-mono text-[12px] leading-relaxed">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[--primary]">bash</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `curl -X POST https://gateway.example.com/v1/chat/completions \\\n  -H "Authorization: Bearer ${connections[0]?.apiKey ?? "<YOUR_KEY>"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`,
                    );
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="h-3 w-3 text-[--on-surface-variant]" />
                </Button>
              </div>
              <pre className="text-[--on-surface-variant] whitespace-pre-wrap">
{`curl -X POST https://gateway.example.com/v1/chat/completions \\
  -H "Authorization: Bearer <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`}
              </pre>
            </div>
          </div>
        </div>

        {/* Right: Automated Routing */}
        <div className={cardStyle}>
          <div className={cardHeaderStyle}>
            <p className="text-sm font-semibold text-[--on-surface]">Automated Routing</p>
            <p className="text-[11px] text-[--on-surface-variant] mt-0.5">
              Intelligent traffic distribution
            </p>
          </div>
          <div className="p-6 flex flex-col justify-between h-full">
            <div>
              <p className="text-sm text-[--on-surface] leading-relaxed">
                Automatically route requests across providers based on latency, cost, and availability.
                Set fallback chains and priority rules to ensure maximum uptime.
              </p>
            </div>
            <Button
              className={primaryBtnStyle + " mt-4 self-start"}
              variant="outline"
            >
              Configure Routing Rules
              <span className="ml-2">→</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">
              {editing ? "Edit Provider" : "Add Provider"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              Configure your LLM provider connection
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Provider
              </Label>
              <Input
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                placeholder="e.g. openai"
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                API Key
              </Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-…"
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Base URL{" "}
                <span className="font-normal normal-case tracking-normal text-[--on-surface-variant]">
                  (optional)
                </span>
              </Label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com"
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Priority
              </Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              className="h-10 px-4 rounded font-medium text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors"
            >
              {editing ? "Save Changes" : "Add Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
