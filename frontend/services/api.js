/**
 * Centralized API Client Service for IT Support Agent.
 * Interacts with FastAPI backend endpoints:
 *  - Chat: /api/chat
 *  - Sessions: /api/sessions, /api/sessions/:id
 *  - HITL: /api/hitl/:id/approve
 *  - Diagnostics: /api/diagnostics/tools, /api/diagnostics/run
 *  - Knowledge Base: /api/knowledge/documents, /api/knowledge/upload, /api/knowledge/rebuild
 *  - Health: /api/health
 */

const getApiBaseUrl = () => {
  if (typeof process !== "undefined" && process.env) {
    if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  }
  if (typeof window !== "undefined" && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__;
  }
  if (typeof window !== "undefined" && window.location) {
    // If running on same origin as backend (e.g. port 8000 or Vercel single-deployment)
    return window.location.origin;
  }
  return "http://localhost:8000";
};

export const API_BASE = getApiBaseUrl();

/**
 * Perform a fetch request with unified error handling and timeout.
 */
async function request(endpoint, options = {}) {
  const url = `${getApiBaseUrl()}${endpoint}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        errorBody.detail ||
        errorBody.message ||
        `Request failed with status ${response.status}: ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      err.body = errorBody;
      throw err;
    }

    return await response.json();
  } catch (err) {
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      throw new Error(
        "Unable to connect to the IT support service. Please ensure the backend is running."
      );
    }
    throw err;
  }
}

// ── Health Check ─────────────────────────────────────────────────────────────

export async function checkHealth() {
  return request("/api/health");
}

// ── Session Management ───────────────────────────────────────────────────────

export async function createSession(userId = "default") {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function listSessions() {
  return request("/api/sessions");
}

export async function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`);
}

export async function deleteSession(sessionId) {
  return request(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

// ── Chat & Agent Execution ───────────────────────────────────────────────────

export async function sendMessage(message, sessionId = null) {
  if (!message || !message.trim()) {
    throw new Error("Message cannot be empty.");
  }
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message: message.trim(),
      session_id: sessionId,
    }),
  });
}

export async function submitHITLApproval(sessionId, approved) {
  return request(`/api/hitl/${sessionId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: Boolean(approved) }),
  });
}

// ── Diagnostics & Tool Calling ───────────────────────────────────────────────

export async function listDiagnosticTools() {
  return request("/api/diagnostics/tools");
}

export async function runDiagnostic(toolName, args = {}) {
  return request("/api/diagnostics/run", {
    method: "POST",
    body: JSON.stringify({
      tool_name: toolName,
      args,
    }),
  });
}

// ── Knowledge Base ───────────────────────────────────────────────────────────

export async function listKnowledgeDocuments() {
  return request("/api/knowledge/documents");
}

export async function uploadKnowledgeDocument(docData) {
  return request("/api/knowledge/upload", {
    method: "POST",
    body: JSON.stringify(docData),
  });
}

export async function rebuildKnowledgeBase() {
  return request("/api/knowledge/rebuild", {
    method: "POST",
  });
}

export default {
  API_BASE,
  checkHealth,
  createSession,
  listSessions,
  getSession,
  deleteSession,
  sendMessage,
  submitHITLApproval,
  listDiagnosticTools,
  runDiagnostic,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
  rebuildKnowledgeBase,
};
