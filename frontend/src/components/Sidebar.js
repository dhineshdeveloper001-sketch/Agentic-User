"use client";

export default function Sidebar({
  sessions = [],
  activeSessionId,
  onNewChat,
  onSessionClick,
  backendOnline,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🤖</div>
          <div>
            <h1>IT Support Agent</h1>
            <p>Intelligent Helpdesk</p>
          </div>
        </div>

        <button
          className="new-chat-btn"
          onClick={onNewChat}
          disabled={!backendOnline}
          id="new-chat-btn"
        >
          <span>＋</span> New Support Session
        </button>
      </div>

      {!backendOnline && (
        <div className="outage-banner">
          <div className="outage-banner-header">
            <span className="outage-badge">Backend Offline</span>
          </div>
          <p className="outage-text">
            Start the backend server to connect:
            <br />
            <code style={{ fontSize: "11px" }}>
              cd backend && python -m backend.main
            </code>
          </p>
        </div>
      )}

      <div className="sidebar-sessions">
        <h3>Recent Sessions</h3>

        {sessions.length === 0 ? (
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-tertiary)",
              padding: "12px 8px",
              lineHeight: 1.6,
            }}
          >
            No sessions yet. Click &quot;New Support Session&quot; or start
            typing to begin.
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${
                session.id === activeSessionId ? "active" : ""
              }`}
              onClick={() => onSessionClick(session.id)}
              id={`session-${session.id.slice(0, 8)}`}
            >
              <span className="session-icon">
                {session.resolved ? "✅" : "💬"}
              </span>
              <div className="session-info">
                <div className="session-title">{session.title}</div>
                <div className="session-meta">
                  {session.messageCount} messages
                  {session.resolved ? " · Resolved" : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
