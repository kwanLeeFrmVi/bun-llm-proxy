import { useAuth } from "@/lib/auth.tsx";
import { NavLink } from "react-router-dom";
import { Network, Key, BarChart2, Terminal, Box, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/providers", label: "Providers", Icon: Network },
  { to: "/keys", label: "API Keys", Icon: Key },
  { to: "/usage", label: "Usage", Icon: BarChart2 },
  { to: "/logs", label: "Console", Icon: Terminal },
  { to: "/models", label: "Models", Icon: Box },
];

export default function Sidebar() {
  const { username, logout } = useAuth();

  return (
    <aside className='flex w-64 flex-col bg-muted p-4'>
      {/* Logo */}
      <div className='flex items-center gap-3 px-2 mb-8'>
        <div className='flex items-center justify-center rounded-lg bg-blue-400/30 p-1 text-on-primary'>
          <img src='/logo.svg' alt='LLM Gateway' className='h-14 w-14' />
        </div>
        <div>
          <h1 className='font-headline font-bold text-lg text-foreground'>
            LLM Gateway
          </h1>
          <p className='text-[10px] text-muted-foreground font-medium tracking-widest uppercase'>
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
        <div className='mb-1 px-1 text-xs text-muted-foreground truncate'>
          {username ?? "Admin"}
        </div>
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
