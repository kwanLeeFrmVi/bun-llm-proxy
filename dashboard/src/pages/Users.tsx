import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api.ts";
import { Users as UsersIcon, Plus, ShieldCheck, User, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface UserRecord {
  id: string;
  username: string;
  role: string;
  createdAt?: string;
}

const cardStyle =
  "bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] overflow-hidden";

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

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  // Change password form state
  const [pwValue, setPwValue] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.users.list();
      setUsers(data.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      await api.users.create(newUsername.trim(), newPassword.trim(), newRole);
      toast.success(`User "${newUsername}" created`);
      setShowModal(false);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function handleChangePassword() {
    if (!selectedUser || !pwValue.trim()) return;
    setChangingPw(true);
    try {
      await api.users.changePassword(selectedUser.id, pwValue.trim());
      toast.success(`Password updated for "${selectedUser.username}"`);
      setShowPwModal(false);
      setPwValue("");
      setSelectedUser(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setChangingPw(false);
    }
  }

  async function handleDelete(u: UserRecord) {
    if (u.username === "admin") {
      toast.error("Cannot delete the bootstrap admin user");
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete user "${u.username}"? All their API keys and sessions will be removed.`
      )
    ) {
      return;
    }
    try {
      await api.users.remove(u.id);
      toast.success(`User "${u.username}" deleted`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete user");
    }
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const userCount = users.filter((u) => u.role === "user").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl sm:text-3xl font-bold tracking-tight text-[--on-surface]">
          Users
        </h1>
        <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] mt-1 font-medium">
          Manage user accounts and access roles
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-[--on-surface-variant] font-semibold">
            Total Users
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {users.length}
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-amber-600 font-semibold">Admins</p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {adminCount}
          </p>
        </div>
        <div className={cardStyle + " p-6"}>
          <p className="text-xs uppercase tracking-[0.12em] text-blue-600 font-semibold">
            Base Users
          </p>
          <p className="text-3xl font-bold font-headline mt-1 tracking-tight text-[--on-surface]">
            {userCount}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className={cardStyle}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(203,213,225,0.4)]">
          <div className="flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-[--on-surface-variant]" />
            <span className="text-sm font-semibold text-[--on-surface]">All Accounts</span>
          </div>
          <Button
            className="h-10 px-5 rounded font-semibold text-sm tracking-wide bg-[#0F172A] text-white hover:bg-[#1e293b] transition-colors"
            onClick={() => setShowModal(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> Create User
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <p className="text-[--on-surface-variant] text-sm">Loading…</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[rgba(203,213,225,0.4)]">
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pl-6">
                  Username
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3">
                  Role
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 hidden md:table-cell">
                  Created
                </TableHead>
                <TableHead className="uppercase text-xs tracking-widest font-semibold text-[--on-surface-variant] py-3 pr-6 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u, i) => (
                <TableRow
                  key={u.id}
                  className={
                    "border-b border-[rgba(203,213,225,0.25)] hover:bg-[--surface-container-low]/50 transition-colors" +
                    (i % 2 === 1 ? " bg-[--surface-container-low]/40" : "")
                  }
                >
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-[--primary-fixed] text-[--on-primary-fixed]">
                        {u.role === "admin" ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <span className="text-sm font-semibold text-[--on-surface]">
                        {u.username}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="text-sm text-[--on-surface-variant] hidden md:table-cell">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs font-medium"
                        onClick={() => navigate(`/users/${u.id}`)}
                      >
                        <KeyRound className="w-3 h-3 mr-1" />
                        Manage Keys
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(u)}
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-white rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">Create User</DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              Add a new user account and assign their role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Username
              </Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. alice"
                autoFocus
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Password
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
                Role
              </Label>
              <div className="flex gap-3">
                {(["user", "admin"] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={newRole === r ? "default" : "outline"}
                    onClick={() => setNewRole(r)}
                    className={
                      "flex-1 h-10" +
                      (newRole === r
                        ? "bg-[--primary]hover:bg-[--primary]/90"
                        : "text-[--on-surface-variant]")
                    }
                  >
                    {r === "admin" ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                    {r === "admin" ? "Admin" : "Base User"}
                  </Button>
                ))}
              </div>
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
              disabled={creating || !newUsername.trim() || !newPassword.trim()}
              className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
            >
              {creating ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPwModal} onOpenChange={setShowPwModal}>
        <DialogContent className="bg-[--surface-container-lowest] rounded-xl border border-[rgba(203,213,225,0.6)] shadow-[0_8px_30px_rgba(0,0,0,0.06)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-headline text-lg font-bold">Change Password</DialogTitle>
            <DialogDescription className="text-sm text-[--on-surface-variant]">
              Set a new password for <strong>{selectedUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs uppercase tracking-widest font-semibold text-[--on-surface-variant]">
              New Password
            </Label>
            <Input
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="Minimum 6 characters"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
              className="h-11 bg-[--surface-container-low] border border-[--outline-variant] rounded-lg text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPwModal(false)}
              className="h-10 px-4 rounded font-medium text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changingPw || pwValue.trim().length < 6}
              className="h-10 px-5 rounded font-semibold text-sm bg-[#0F172A] text-white hover:bg-[#1e293b]"
            >
              {changingPw ? "Saving…" : "Save Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
