"use client";

/**
 * Displays tool execution results as collapsible cards.
 * Shows diagnostic tool name, purpose, and result status.
 */
export default function ToolCard({ results = [] }) {
  if (!results.length) return null;

  return (
    <div className="tool-cards">
      {results.map((r, i) => {
        const isSuccess = r.result?.is_healthy || r.result?.reachable || r.result?.status === "success";
        const isError = r.result?.error || r.result?.status === "degraded" || r.result?.reachable === false;

        let statusEmoji = "🔍";
        if (isSuccess) statusEmoji = "✅";
        else if (isError) statusEmoji = "❌";

        // Extract a human-readable result summary
        let resultSummary = "";
        if (r.result?.message) {
          resultSummary = r.result.message;
        } else if (r.result?.error) {
          resultSummary = `Error: ${r.result.error}`;
        } else if (r.result?.status) {
          resultSummary = `Status: ${r.result.status}`;
        }

        // Add latency info if available
        if (r.result?.latency_ms) {
          resultSummary += ` (${r.result.latency_ms}ms)`;
        }

        return (
          <div key={i} className="tool-card" id={`tool-card-${i}`}>
            <span className="tool-card-icon">🔧</span>
            <div className="tool-card-info">
              <div className="tool-card-name">
                {formatToolName(r.tool)}
                {r.args && Object.keys(r.args).length > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--text-tertiary)", marginLeft: 4 }}>
                    ({Object.values(r.args).join(", ")})
                  </span>
                )}
              </div>
              <div className="tool-card-result">{resultSummary}</div>
            </div>
            <span className="tool-card-status">{statusEmoji}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatToolName(name) {
  return (name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
