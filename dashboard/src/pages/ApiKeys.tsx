import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api.ts";
import { maskKey } from "@/lib/utils.ts";
import { Plus, Trash2, Copy, Check, Key, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/PaginationControls";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  createdAt?: string;
}

const PAGE_SIZE = 10;
const cardStyle = "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";
const primaryBtnStyle = "h-10 px-5 rounded font-semibold text-[14px] tracking-wide bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors duration-150";

function StatusPill({ active }: { active: boolean | number }) {
  const isActive = !!active;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
        isActive
          ? "bg-[--primary-fixed] text-[--on-primary-fixed]"
          : "bg-[--surface-container-high] text-[--on-surface-variant]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[--on-primary-fixed]" : "bg-[--on-surface-variant]"}`} />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newlyCreated, setNewlyCreated] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const data = (await api.keys.list()) as { keys: ApiKey[] };
      setKeys(data.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = (await api.keys.create(newName)) as ApiKey;
      setNewlyCreated(created);
      setNewName("");
      load();
      toast.success("API key created");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this API key?")) return;
    try {
      await api.keys.remove(id);
      toast.success("API key deleted");
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  }

  function copyKey(k: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(k).then(() => {
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  const filtered = keys.filter((k) =>
    k.name?.toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = keys.filter((k) => k.isActive).length;

  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight text-[--on-surface]">
          API Keys
        </h1>
        <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1.5 font-medium">
          Manage secure access tokens for your applications and services.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Active Keys
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {keys.length}
          </p>
          <p className="text-xs text-[--primary] mt-1">+2 this month</p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Requests (24h)
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            1.2M
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-[--surface-container-high] overflow-hidden">
            <div className="h-full rounded-full bg-[--primary] w-[75%]" />
          </div>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Active Connections
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {activeCount}
          </p>
          <p className="text-xs text-[--on-surface-variant] mt-1">
            Endpoints currently using these keys
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className={cardStyle}>
        {/* Table Header Bar */}
        <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[rgba(203,213,225,0.4)]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--on-surface-variant]" />
              <Input
                placeholder="Search keys..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full sm:w-64 bg-[--surface-container-low] border border-[rgba(203,213,225,0.6)] rounded-lg text-sm focus:border-[--primary]"
              />
            </div>
          </div>
          <Button
            className={primaryBtnStyle}
            onClick={() => {
              setNewlyCreated(null);
              setShowModal(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Create New Key
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">No API keys found.</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowModal(true)}>
              Create your first key
            </Button>
          </div>
        ) : (
          <>
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 pl-6">
                    Key Name
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3">
                    Prefix
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell">
                    Created
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-[0.1em] font-semibold text-[--on-surface-variant] py-3 hidden lg:table-cell">
                    Last Used
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
                {paged.map((k, i) => (
                  <TableRow
                    key={k.id}
                    className={
                      "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                      ((page * PAGE_SIZE + i) % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                    }
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed]">
                          <Key className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-sm font-semibold text-[--on-surface]">
                          {k.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="endpoint">
                        {maskKey(k.key ?? "")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-[--on-surface-variant] hidden md:table-cell">
                      {k.createdAt
                        ? new Date(k.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-[13px] text-[--on-surface-variant] hidden lg:table-cell">
                      2 mins ago
                    </TableCell>
                    <TableCell>
                      <StatusPill active={k.isActive} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-[--surface-container-low]"
                        onClick={() => k.key && copyKey(k.key)}
                        disabled={!k.key}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-[--primary]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-[--on-surface-variant]" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-50"
                        onClick={() => handleDelete(k.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              label="KEYS"
            />
          </>
        )}
      </div>

      {/* Security Best Practices */}
      <div
        className="rounded-xl border border-dashed border-[rgba(203,213,225,0.6)] p-5 bg-[--surface-container-lowest]"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed] shrink-0">
            <Shield className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[--on-surface]">Security Best Practices</p>
            <p className="text-[13px] text-[--on-surface-variant] mt-1 leading-relaxed">
              Your API keys carry significant privileges. Never share your secret keys in client-side code,
              public repositories, or other publicly accessible areas. We recommend rotating your keys every
              90 days to maintain maximum security.
            </p>
          </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">
              {newlyCreated ? "Key Created" : "Create API Key"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              {newlyCreated
                ? "Copy your key now — it won't be shown again."
                : "Generate a new API key for accessing the gateway."}
            </DialogDescription>
          </DialogHeader>

          {newlyCreated ? (
            <div className="space-y-4">
              <div className="bg-[--surface-container-low] rounded-lg p-4 font-mono text-[13px] break-all text-[--on-surface]">
                {newlyCreated.key}
              </div>
              <Button
                className="w-full h-10"
                onClick={() => copyKey(newlyCreated.key)}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy Key
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                    Key Name
                  </Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Production Gateway"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
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
                  onClick={handleCreate}
                  className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors"
                >
                  Create
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}