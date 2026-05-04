import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { Loader } from "@/components/Loader";
import Login from "@/pages/Login";

// Lazy-load all routes to keep the initial bundle small
const Usage = lazy(() => import("@/pages/Usage"));
const Logs = lazy(() => import("@/pages/Logs"));
const Models = lazy(() => import("@/pages/Models"));
const ProviderDetail = lazy(() => import("@/pages/ProviderDetail"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const OAuthCallback = lazy(() => import("@/pages/OAuthCallback"));

// Lazy-load heavy secondary routes to reduce initial bundle
const Providers = lazy(() => import("@/pages/Providers"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const ZaiUsage = lazy(() => import("@/pages/ZaiUsage"));
const ProxUsage = lazy(() => import("@/pages/ProxUsage"));
const ApiKeys = lazy(() => import("@/pages/ApiKeys"));
const Users = lazy(() => import("@/pages/Users"));
const UserDetail = lazy(() => import("@/pages/UserDetail"));
const ModelStats = lazy(() => import("@/pages/ModelStats"));
const ClaudibleUsage = lazy(() => import("@/pages/ClaudibleUsage"));

function ProtectedLayout() {
  const { token, role, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isAdmin = role === "admin";

  if (loading) return <Loader />;
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-muted border-b border-border">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="LLM Gateway" className="h-8 w-8" />
            <span className="font-headline font-bold text-base">LLM Gateway</span>
          </div>
          <button
            aria-label="Open sidebar"
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="12" x2="20" y2="12"></line>
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="4" y1="18" x2="20" y2="18"></line>
            </svg>
          </button>
        </header>

        <main
          className="flex-1 overflow-auto p-4 md:p-8"
          style={{
            backgroundImage: "radial-gradient(circle at 2px 2px, #dde3e9 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to={isAdmin ? "/providers" : "/keys"} replace />} />
            {/* Admin-only routes */}
            {isAdmin && (
              <>
                <Route
                  path="/providers"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Providers />
                    </Suspense>
                  }
                />
                <Route
                  path="/providers/:providerId"
                  element={
                    <Suspense fallback={<Loader />}>
                      <ProviderDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <Suspense fallback={<Loader />}>
                      <Users />
                    </Suspense>
                  }
                />
                <Route
                  path="/users/:userId"
                  element={
                    <Suspense fallback={<Loader />}>
                      <UserDetail />
                    </Suspense>
                  }
                />
              </>
            )}
            {/* Shared routes */}
            <Route
              path="/claudible-usage"
              element={
                <Suspense fallback={<Loader />}>
                  <ClaudibleUsage />
                </Suspense>
              }
            />
            <Route
              path="/keys"
              element={
                <Suspense fallback={<Loader />}>
                  <ApiKeys />
                </Suspense>
              }
            />
            <Route
              path="/usage"
              element={
                <Suspense fallback={<Loader />}>
                  <Usage />
                </Suspense>
              }
            />
            <Route
              path="/leaderboard"
              element={
                <Suspense fallback={<Loader />}>
                  <Leaderboard />
                </Suspense>
              }
            />
            <Route
              path="/zai-usage"
              element={
                <Suspense fallback={<Loader />}>
                  <ZaiUsage />
                </Suspense>
              }
            />
            <Route
              path="/prox-usage"
              element={
                <Suspense fallback={<Loader />}>
                  <ProxUsage />
                </Suspense>
              }
            />
            <Route
              path="/logs"
              element={
                <Suspense fallback={<Loader />}>
                  <Logs />
                </Suspense>
              }
            />
            <Route
              path="/models"
              element={
                <Suspense fallback={<Loader />}>
                  <Models />
                </Suspense>
              }
            />
            <Route
              path="/models/:modelId"
              element={
                <Suspense fallback={<Loader />}>
                  <ModelStats />
                </Suspense>
              }
            />
            <Route
              path="/change-password"
              element={
                <Suspense fallback={<Loader />}>
                  <ChangePassword />
                </Suspense>
              }
            />
            {/* Catch-all: redirect to appropriate home */}
            <Route path="*" element={<Navigate to={isAdmin ? "/providers" : "/keys"} replace />} />
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
        <Route
          path="/login"
          element={
            <Suspense fallback={<Loader />}>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/oauth/callback"
          element={
            <Suspense fallback={<Loader />}>
              <OAuthCallback />
            </Suspense>
          }
        />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
