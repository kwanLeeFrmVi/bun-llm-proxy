import { useAuth } from "@/lib/auth.tsx";
import { NavLink } from "react-router-dom";
import { Network, Key, BarChart2, Terminal, Box, LogOut, Users, KeyRound, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { username, role, logout } = useAuth();
  const isAdmin = role === "admin";

  const NAV = [
    ...(isAdmin ? [{ to: "/providers", label: "Providers", Icon: Network }] : []),
    { to: "/keys", label: "API Keys", Icon: Key },
    { to: "/usage", label: "Usage", Icon: BarChart2 },
    { to: "/mavis-usage", label: "Mavis", Icon: Cloud },
    { to: "/logs", label: "Console", Icon: Terminal },
    { to: "/models", label: "Models", Icon: Box },
    ...(isAdmin ? [{ to: "/users", label: "Users", Icon: Users }] : []),
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-muted p-4 transition-transform duration-300 lg:relative lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Close Button (Mobile) */}
      <button
        onClick={onClose}
        className='lg:hidden absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground'
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='20'
          height='20'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <line x1='18' y1='6' x2='6' y2='18'></line>
          <line x1='6' y1='6' x2='18' y2='18'></line>
        </svg>
      </button>

      {/* Logo */}
      <div className='flex items-center gap-3 px-2 mb-8'>
        <div className='flex items-center justify-center rounded-lg bg-blue-400/30 p-1 text-on-primary'>
          <img src='/logo.svg' alt='LLM Gateway' className='h-14 w-14' />
        </div>
        <div>
          <h1 className='font-headline font-bold text-lg text-foreground'>
            LLM Gateway
          </h1>
          <p className='text-xs text-muted-foreground font-medium tracking-widest uppercase'>
            Management Console
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className='flex-1 space-y-1'>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => {
              if (window.innerWidth < 1024) onClose();
            }}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200",
                isActive
                  ? "bg-card text-primary inner-glow"
                  : "text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )
            }
          >
            <Icon className='h-4 w-4 shrink-0' />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className='pt-4 mt-4 bg-card/30 rounded-lg p-3'>
        <div className='mb-1 px-1 flex items-center gap-1.5'>
          <span className='text-xs text-muted-foreground truncate'>
            {username && username !== "undefined" ? username : "Admin"}
          </span>
          {role && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider",
              role === "admin"
                ? "bg-amber-100 text-amber-700"
                : "bg-blue-100 text-blue-700"
            )}>
              {role}
            </span>
          )}
        </div>
        {/* Change Password (base users only) */}
        {role === "user" && (
          <NavLink
            to="/change-password"
            onClick={() => { if (window.innerWidth < 1024) onClose(); }}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-2 px-2 py-2 text-sm font-medium rounded-md transition-colors mb-1",
                isActive
                  ? "text-primary bg-card"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <KeyRound className='h-4 w-4' />
            Change Password
          </NavLink>
        )}
        <button
          onClick={logout}
          className='flex w-full items-center gap-2 px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors'
        >
          <LogOut className='h-4 w-4' />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
