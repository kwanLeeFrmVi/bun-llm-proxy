import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.tsx";
import Sidebar from "@/components/Sidebar.tsx";
import Login from "@/pages/Login.tsx";
import Providers from "@/pages/Providers.tsx";
import ProviderDetail from "@/pages/ProviderDetail";
import ApiKeys from "@/pages/ApiKeys.tsx";
import Usage from "@/pages/Usage.tsx";
import Logs from "@/pages/Logs.tsx";
import Models from "@/pages/Models.tsx";
import Users from "@/pages/Users.tsx";
import ChangePassword from "@/pages/ChangePassword.tsx";
import OAuthCallback from "@/pages/OAuthCallback.tsx";
import { Loader } from "@/components/Loader.tsx";

function ProtectedLayout() {
  const { token, role, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isAdmin = role === "admin";

  if (loading) return <Loader />;
  if (!token) return <Navigate to='/login' replace />;

  return (
    <div className='flex h-screen bg-surface overflow-hidden'>
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className='fixed inset-0 bg-black/50 z-40 lg:hidden'
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
        {/* Mobile Header */}
        <header className='lg:hidden flex items-center justify-between p-4 bg-muted border-b border-border'>
          <div className='flex items-center gap-2'>
            <img src='/logo.svg' alt='LLM Gateway' className='h-8 w-8' />
            <span className='font-headline font-bold text-base'>
              LLM Gateway
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className='p-2 text-muted-foreground hover:text-foreground'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              width='24'
              height='24'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <line x1='4' y1='12' x2='20' y2='12'></line>
              <line x1='4' y1='6' x2='20' y2='6'></line>
              <line x1='4' y1='18' x2='20' y2='18'></line>
            </svg>
          </button>
        </header>

        <main
          className='flex-1 overflow-auto p-4 md:p-8'
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, #dde3e9 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        >
          <Routes>
            <Route
              path='/'
              element={
                <Navigate to={isAdmin ? "/providers" : "/keys"} replace />
              }
            />
            {/* Admin-only routes */}
            {isAdmin && (
              <>
                <Route path='/providers' element={<Providers />} />
                <Route
                  path='/providers/:providerId'
                  element={<ProviderDetail />}
                />
                <Route path='/users' element={<Users />} />
              </>
            )}
            {/* Shared routes */}
            <Route path='/keys' element={<ApiKeys />} />
            <Route path='/usage' element={<Usage />} />
            <Route path='/logs' element={<Logs />} />
            <Route path='/models' element={<Models />} />
            <Route path='/change-password' element={<ChangePassword />} />
            {/* Catch-all: redirect to appropriate home */}
            <Route
              path='*'
              element={
                <Navigate to={isAdmin ? "/providers" : "/keys"} replace />
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/login' element={<Login />} />
        <Route path='/oauth/callback' element={<OAuthCallback />} />
        <Route path='/*' element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
