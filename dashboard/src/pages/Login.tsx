import { useState } from "react";
import { useAuth } from "@/lib/auth.tsx";
import {
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
  Shield,
  LockKeyhole,
  Network,
  AlertCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "48px",
    paddingLeft: "42px",
    paddingRight: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "4px",
    fontSize: "0.875rem",
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#0F172A";
    e.target.style.boxShadow = "0 0 0 1px #0F172A";
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#e2e8f0";
    e.target.style.boxShadow = "none";
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        backgroundColor: "#f7f9fb",
        color: "#2a3439",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <main
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          position: "relative",
        }}
      >
        {/* Dot grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage:
              "radial-gradient(circle at 2px 2px, #dde3e9 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Ambient blurs */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 500,
              height: 500,
              background: "rgba(200,210,220,0.35)",
              borderRadius: "50%",
              filter: "blur(120px)",
              transform: "translate(50%, -50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: 500,
              height: 500,
              background: "rgba(200,210,220,0.35)",
              borderRadius: "50%",
              filter: "blur(120px)",
              transform: "translate(-50%, 50%)",
            }}
          />
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            position: "relative",
            zIndex: 10,
          }}
        >
          {/* Brand */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div className='inline-flex items-center justify-center w-[52px] h-[52px] rounded-[10px] bg-[#0F172A] mb-5 shadow-[0_4px_12px_rgba(0,0,0,0.15)]'>
              <img src='/logo.svg' alt='LLM Gateway' className='h-14 w-14' />
            </div>
            <h1
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "1.75rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                margin: 0,
              }}
            >
              Gateway
            </h1>
            <p
              style={{
                fontSize: "0.6875rem",
                letterSpacing: "0.12em",
                color: "#64748b",
                marginTop: "6px",
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              Management Console
            </p>
          </div>

          {/* Card */}
          <div
            style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(203,213,225,0.6)",
              borderRadius: "6px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
              padding: "40px",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {error && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "4px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    color: "#b91c1c",
                    fontSize: "0.875rem",
                  }}
                >
                  <AlertCircle
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  {error}
                </div>
              )}

              {/* Username */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <label
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                  htmlFor='username'
                >
                  Username
                </label>
                <div style={{ position: "relative" }}>
                  <User
                    style={{
                      position: "absolute",
                      left: "13px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 17,
                      height: 17,
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    id='username'
                    type='text'
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder='admin'
                    autoComplete='username'
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>

              {/* Password */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <label
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                    htmlFor='password'
                  >
                    Password
                  </label>
                  <a
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: "#0f172a",
                      textDecoration: "none",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                    href='#'
                  >
                    Forgot password?
                  </a>
                </div>
                <div style={{ position: "relative" }}>
                  <Lock
                    style={{
                      position: "absolute",
                      left: "13px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 17,
                      height: 17,
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    id='password'
                    type='password'
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder='••••••••'
                    autoComplete='current-password'
                    style={inputStyle}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>

              {/* Remember me */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Checkbox
                  id='remember-me'
                  className='border-slate-300 data-[state=checked]:bg-[#0F172A] data-[state=checked]:border-[#0F172A]'
                />
                <Label
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "#475569",
                    cursor: "pointer",
                  }}
                  htmlFor='remember-me'
                >
                  Remember me
                </Label>
              </div>

              {/* Submit */}
              <button
                type='submit'
                disabled={loading}
                style={{
                  width: "100%",
                  height: "48px",
                  background: "#0F172A",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  letterSpacing: "0.04em",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "background 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "#1e293b";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#0F172A";
                }}
              >
                {loading ? (
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      animation: "lspin 0.7s linear infinite",
                      display: "inline-block",
                    }}
                  />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight style={{ width: 18, height: 18 }} />
                  </>
                )}
              </button>
            </form>

            {/* Request access */}
            <div
              style={{
                marginTop: "32px",
                paddingTop: "32px",
                borderTop: "1px solid #f1f5f9",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                New to the gateway?{" "}
                <a
                  style={{
                    color: "#0f172a",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                  href='#'
                >
                  Request access
                </a>
              </p>
            </div>
          </div>

          {/* Trust icons */}
          <div
            style={{
              marginTop: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "28px",
              color: "#cbd5e1",
            }}
          >
            <ShieldCheck style={{ width: 22, height: 22 }} />
            <Shield style={{ width: 22, height: 22 }} />
            <LockKeyhole style={{ width: 22, height: 22 }} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          borderTop: "1px solid #e9eef2",
          background: "rgba(248,250,251,0.5)",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94a3b8",
            fontWeight: 500,
          }}
        >
          &copy; 2024 Logic. All rights reserved.
        </span>
        <div style={{ display: "flex", gap: "24px" }}>
          {["Privacy Policy", "Terms of Service", "Security Documentation"].map(
            (link) => (
              <a
                key={link}
                href='#'
                style={{
                  fontSize: "0.6875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#94a3b8",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                {link}
              </a>
            ),
          )}
        </div>
      </footer>

      <style>{`@keyframes lspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
