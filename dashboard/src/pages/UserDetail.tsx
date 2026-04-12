import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { maskKey } from "@/lib/utils.ts";
import {
  ArrowLeft,
  Key,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  User,
  UserCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface UserDetail {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  createdAt: string;
  userId: string | null;
  ownerUsername: string | null;
}

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";
const primaryBtnStyle =
  "h-10 px-5 rounded font-semibold text-sm tracking-wide bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors duration-150";

function RoleBadge({ role }: { role: string }) {
  return role === "admin" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
      <ShieldCheck className="w-3 h-3" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
      <User className="w-3 h-3" /> User
    </span>
  );
}

function StatusPill({ active }: { active: boolean | number }) {
  const isActive = !!active;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
        isActive
          ? "bg-[--primary-fixed] text-[--on-primary-fixed]"
          : "bg-[--surface-container-high] text-[--on-surface-variant]"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[--on-primary-fixed]" : "bg-[--on-surface-variant]"}`}
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [assignedKeys, setAssignedKeys] = useState<ApiKey[]>([]);
  const [unassignedKeys, setUnassignedKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Create key state
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKey | null>(null);

  // Assign key state
  const [showAssignModal, setShowAssignModal] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await api.users.get(userId);
      setUser(data.user);
      setAssignedKeys(data.assignedKeys);
      setUnassignedKeys(data.unassignedKeys);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load user");
      navigate("/users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function handleChangePassword() {
    if (!user || !newPassword.trim()) return;
    setChangingPassword(true);
    try {
      await api.users.changePassword(user.id, newPassword.trim());
      toast.success("Password updated successfully");
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleCreateKey() {
    if (!user || !newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const created = await api.keys.create(newKeyName.trim(), user.id);
      setNewlyCreatedKey(created as ApiKey);
      setNewKeyName("");
      load();
      toast.success("API key created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleAssignKey(keyId: string) {
    try {
      await api.keys.update(keyId, { userId });
      toast.success("Key assigned to user");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign key");
    }
  }

  async function handleUnassignKey(keyId: string) {
    if (!confirm("Remove this key from the user?")) return;
    try {
      await api.keys.update(keyId, { userId: null });
      toast.success("Key unassigned from user");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unassign key");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[--on-surface-variant] text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[--on-surface-variant] text-sm">User not found</p>
        <Button variant="outline" onClick={() => navigate("/users")}>
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/users")} className="h-9 w-9">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[--primary-fixed] text-[--on-primary-fixed]">
              {user.role === "admin" ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <UserCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
                {user.username}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <RoleBadge role={user.role} />
                <span className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant]">
                  {user.createdAt
                    ? `Joined ${new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Password Change Section */}
        <div className={cardStyle}>
          <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
            <h2 className="font-semibold text-[--on-surface] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Change Password
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                New Password
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || newPassword.trim().length < 6}
              className={primaryBtnStyle}
            >
              <Save className="h-4 w-4 mr-2" />
              {changingPassword ? "Saving…" : "Update Password"}
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className={cardStyle}>
          <div className="px-6 py-4 border-b border-[rgba(203,213,225,0.4)]">
            <h2 className="font-semibold text-[--on-surface] flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              API Keys Summary
            </h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-[--surface-container-low] rounded-lg">
              <p className="text-xs uppercase tracking-widest text-[--on-surface-variant] font-semibold">
                Assigned Keys
              </p>
              <p className="text-2xl font-bold font-headline mt-1 text-[--on-surface]">
                {assignedKeys.length}
              </p>
            </div>
            <div className="p-4 bg-[--surface-container-low] rounded-lg">
              <p className="text-xs uppercase tracking-widest text-[--on-surface-variant] font-semibold">
                Available Keys
              </p>
              <p className="text-2xl font-bold font-headline mt-1 text-[--on-surface]">
                {unassignedKeys.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Keys Section */}
      <div className={cardStyle}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(203,213,225,0.4)]">
          <h2 className="font-semibold text-[--on-surface] flex items-center gap-2">
            <Key className="w-4 h-4" />
            Assigned API Keys
            <span className="text-xs font-normal text-[--on-surface-variant]">
              ({assignedKeys.length})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {unassignedKeys.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAssignModal(true)}
                className="h-9"
              >
                <Plus className="h-4 w-4 mr-1" />
                Assign Key
              </Button>
            )}
            <Button
              className={primaryBtnStyle}
              onClick={() => {
                setNewlyCreatedKey(null);
                setShowCreateKeyModal(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create New Key
            </Button>
          </div>
        </div>

        {assignedKeys.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="mx-auto h-12 w-12 text-[--on-surface-variant]/40 mb-3" />
            <p className="text-[--on-surface-variant] text-sm">
              No API keys assigned to this user.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6">
                  Key Name
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3">
                  Prefix
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell">
                  Created
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3">
                  Status
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pr-6 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedKeys.map((k, i) => (
                <TableRow
                  key={k.id}
                  className={
                    "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                    (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                  }
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed]">
                        <Key className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-sm font-semibold text-[--on-surface]">{k.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="endpoint">{maskKey(k.key ?? "")}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-[--on-surface-variant] hidden md:table-cell">
                    {k.createdAt
                      ? new Date(k.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusPill active={k.isActive} />
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnassignKey(k.id)}
                      className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Unassign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Assign Key Dialog */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">Assign API Key</DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              Select an unassigned key to give <strong>{user.username}</strong> access.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 max-h-64 overflow-y-auto">
            {unassignedKeys.length === 0 ? (
              <p className="text-sm text-[--on-surface-variant] text-center py-4">
                No unassigned keys available. Create a new key instead.
              </p>
            ) : (
              <div className="space-y-2">
                {unassignedKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-[--outline-variant] bg-[--surface-container-low] hover:bg-[--surface-container-low]/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Key className="w-4 h-4 text-[--on-surface-variant]" />
                      <div>
                        <p className="text-sm font-medium text-[--on-surface]">{k.name}</p>
                        <p className="text-xs text-[--on-surface-variant] font-mono">
                          {maskKey(k.key ?? "")}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        handleAssignKey(k.id);
                        setShowAssignModal(false);
                      }}
                      className="h-8"
                    >
                      Assign
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAssignModal(false)}
              className="h-10 px-4 rounded font-medium text-sm"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Key Dialog */}
      <Dialog open={showCreateKeyModal} onOpenChange={setShowCreateKeyModal}>
        <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">
              {newlyCreatedKey ? "Key Created" : "Create API Key"}
            </DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              {newlyCreatedKey
                ? "Copy your key now — it won't be shown again."
                : `Create a new API key for ${user.username}.`}
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedKey ? (
            <div className="space-y-4">
              <div className="bg-[--surface-container-low] rounded-lg p-4 font-mono text-sm break-all text-[--on-surface]">
                {newlyCreatedKey.key}
              </div>
              <Button
                className="w-full h-10"
                onClick={() => {
                  navigator.clipboard.writeText(newlyCreatedKey.key ?? "");
                  toast.success("Copied to clipboard");
                }}
              >
                <Save className="h-4 w-4 mr-2" />
                Copy Key
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                    Key Name
                  </Label>
                  <Input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production Key"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
                    className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateKeyModal(false)}
                  className="h-10 px-4 rounded font-medium text-sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  className={primaryBtnStyle}
                >
                  {creatingKey ? "Creating…" : "Create Key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
