"use client";

export default function Sidebar({
  sessions = [],
  activeSessionId,
  currentView = "chat",
  onViewChange,
  onNewChat,
  onSessionClick,
  onDeleteSession,
  backendOnline,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🛡️</div>
          <div className="sidebar-logo-text">
            <h1>IT Support Agent</h1>
            <p>Intelligent Helpdesk</p>
          </div>
        </div>

        <button
          className="new-chat-btn"
          onClick={onNewChat}
          id="new-chat-btn"
          type="button"
          title="Start fresh troubleshooting conversation"
        >
          <span className="btn-icon">＋</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <nav className="sidebar-nav" aria-label="Main Navigation">
        <button
          className={`nav-item ${currentView === "chat" ? "active" : ""}`}
          onClick={() => onViewChange?.("chat")}
          type="button"
        >
          <span className="nav-icon">💬</span>
          <span className="nav-label">Active Chat</span>
        </button>

        <button
          className={`nav-item ${currentView === "history" ? "active" : ""}`}
          onClick={() => onViewChange?.("history")}
          type="button"
        >
          <span className="nav-icon">🗂️</span>
          <span className="nav-label">Chat History</span>
          <span className="nav-badge">{sessions.length}</span>
        </button>

        <button
          className={`nav-item ${currentView === "knowledge" ? "active" : ""}`}
          onClick={() => onViewChange?.("knowledge")}
          type="button"
        >
          <span className="nav-icon">📚</span>
          <span className="nav-label">Knowledge Base</span>
        </button>

        <button
          className={`nav-item ${currentView === "diagnostics" ? "active" : ""}`}
          onClick={() => onViewChange?.("diagnostics")}
          type="button"
        >
          <span className="nav-icon">⚡</span>
          <span className="nav-label">Diagnostics</span>
        </button>
      </nav>

      {!backendOnline && (
        <div className="outage-banner">
          <div className="outage-banner-header">
            <span className="status-indicator-dot error"></span>
            <span className="outage-badge">Backend Offline</span>
          </div>
          <p className="outage-text">
            Agent backend is currently unreachable at port 8000.
          </p>
        </div>
      )}

      <div className="sidebar-sessions-section">
        <div className="sidebar-section-header">
          <h3>Recent Conversations</h3>
        </div>

        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="empty-state-text">
              No conversations yet. Click <strong>New Chat</strong> or start typing.
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
                <span className="session-item-icon">
                  {session.resolved ? "✅" : "💬"}
                </span>
                <div className="session-item-info">
                  <div className="session-item-title">{session.title}</div>
                  <div className="session-item-meta">
                    {session.messageCount} msgs
                    {session.resolved ? " · Resolved" : ""}
                  </div>
                </div>
                {onDeleteSession && (
                  <button
                    className="session-delete-btn"
                    title="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <span className={`status-indicator-dot ${backendOnline ? "" : "error"}`}></span>
          <div className="status-details">
            <span className="status-title">
              {backendOnline ? "Agent Online" : "Agent Offline"}
            </span>
            <span className="status-subtitle">FastAPI & LangGraph</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
