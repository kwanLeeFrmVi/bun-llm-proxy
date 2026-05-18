export interface ModelHubModel {
  id: string;
  endpointId: string;
  modelName: string;
  description: string;
  capabilities: string[];
  contextWindow: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  status: string;
  healthStatus: string;
  healthBars: { status: string }[];
}

export interface ModelHubEndpoint {
  id: string;
  name: string;
  url: string;
  description: string;
  status: string;
  healthUrl: string;
  healthStatus: string;
  syncMode: string;
  sortOrder: number;
  availableEndpoints: string[];
  claudeCodeEnabled: boolean;
  claudeCodeHaiku: string;
  claudeCodeSonnet: string;
  claudeCodeOpus: string;
  codexEnabled: boolean;
  codexModels: string[];
  models: ModelHubModel[];
}

export interface ModelHubResponse {
  endpoints: ModelHubEndpoint[];
}

interface Props {
  data: ModelHubResponse | null;
  loading: boolean;
  error: string | null;
}

function healthColor(status: string): string {
  switch (status) {
    case "healthy":
      return "#10b981";
    case "degraded":
      return "#f59e0b";
    case "unhealthy":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

function HealthDot({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "9999px",
        background: healthColor(status),
      }}
    />
  );
}

export function CldbModelHub({ data, loading, error }: Props) {
  return (
    <div
      style={{
        background: "var(--surface-container-lowest)",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid rgba(203,213,225,0.6)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--on-surface)" }}>
          Model Hub
        </p>
        <p
          style={{
            fontSize: "10px",
            color: "var(--on-surface-variant)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
          }}
        >
          claudible.io/api/model-hub
        </p>
      </div>

      {loading && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--on-surface-variant)",
            textAlign: "center",
            padding: "20px",
          }}
        >
          Loading model hub…
        </p>
      )}

      {error && !loading && (
        <p
          style={{
            fontSize: "12px",
            color: "#ef4444",
            textAlign: "center",
            padding: "20px",
          }}
        >
          {error}
        </p>
      )}

      {!loading && !error && data && data.endpoints.length === 0 && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--on-surface-variant)",
            textAlign: "center",
            padding: "20px",
          }}
        >
          No endpoints available.
        </p>
      )}

      {!loading && !error && data && data.endpoints.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {data.endpoints.map((ep) => (
            <div
              key={ep.id}
              style={{
                border: "1px solid rgba(203,213,225,0.4)",
                borderRadius: "10px",
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <HealthDot status={ep.healthStatus} />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--on-surface)" }}>
                    {ep.name}
                  </span>
                  <a
                    href={ep.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontFamily: "monospace",
                      fontSize: "11px",
                      color: "var(--on-surface-variant)",
                      textDecoration: "none",
                    }}
                  >
                    {ep.url}
                  </a>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {ep.claudeCodeEnabled && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: "rgba(0,83,219,0.15)",
                        color: "#0053db",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Claude Code
                    </span>
                  )}
                  {ep.codexEnabled && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: "rgba(16,185,129,0.15)",
                        color: "#10b981",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Codex
                    </span>
                  )}
                </div>
              </div>

              {ep.description && (
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--on-surface-variant)",
                    marginBottom: "10px",
                  }}
                >
                  {ep.description}
                </p>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(203,213,225,0.4)" }}>
                      {["Model", "Health", "Input $/M", "Output $/M"].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: i === 0 || i === 1 ? "left" : "right",
                            fontWeight: 600,
                            color: "var(--on-surface-variant)",
                            textTransform: "uppercase",
                            fontSize: "10px",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ep.models.map((m) => (
                      <tr
                        key={m.id}
                        style={{ borderBottom: "1px solid rgba(203,213,225,0.2)" }}
                      >
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "var(--on-surface)",
                            fontFamily: "monospace",
                            fontSize: "11px",
                          }}
                        >
                          {m.modelName}
                          {m.description && (
                            <div
                              style={{
                                fontFamily: "inherit",
                                fontSize: "10px",
                                color: "var(--on-surface-variant)",
                                marginTop: "2px",
                              }}
                            >
                              {m.description}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <HealthDot status={m.healthStatus} />
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--on-surface-variant)",
                              }}
                            >
                              {m.healthStatus}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            color: "var(--on-surface)",
                          }}
                        >
                          ${m.inputPricePerMillion}
                        </td>
                        <td
                          style={{
                            padding: "10px 12px",
                            textAlign: "right",
                            color: "var(--on-surface)",
                          }}
                        >
                          ${m.outputPricePerMillion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
