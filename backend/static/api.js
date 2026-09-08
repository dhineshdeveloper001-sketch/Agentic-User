/**
 * IT Support Agent — Centralized Frontend API Service Layer
 * Centralizes all communication with the FastAPI backend.
 */

(function (global) {
  // Determine API base URL (defaults to current origin for single-server deployment)
  const getApiBase = () => {
    if (global.__API_BASE_URL__) return global.__API_BASE_URL__;
    if (typeof location !== "undefined" && location.origin && !location.origin.startsWith("file:")) {
      return location.origin;
    }
    return "http://localhost:8000";
  };

  /**
   * Universal fetch helper with unified error handling and timeout
   */
  async function request(endpoint, options = {}) {
    const baseUrl = getApiBase();
    const url = `${baseUrl}${endpoint}`;
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    };

    try {
      const res = await fetch(url, config);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        let message = errorBody.detail || errorBody.message;

        if (!message) {
          if (res.status === 404) message = "Requested resource was not found on the server.";
          else if (res.status === 500) message = "Internal IT Support Agent error. Please try again later.";
          else message = `Server responded with status ${res.status}: ${res.statusText}`;
        }

        const error = new Error(message);
        error.status = res.status;
        error.data = errorBody;
        throw error;
      }

      return await res.json();
    } catch (err) {
      if (err.name === "TypeError" && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"))) {
        const networkError = new Error("Unable to connect to the IT support service. Please make sure the backend server is running on port 8000.");
        networkError.isNetworkError = true;
        throw networkError;
      }
      throw err;
    }
  }

  const ITSupportAPI = {
    getApiBase,

    /**
     * Health check endpoint
     */
    async checkHealth() {
      return request("/api/health");
    },

    /**
     * Session operations
     */
    async createSession(userId = "default") {
      return request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
    },

    async listSessions() {
      return request("/api/sessions");
    },

    async getSession(sessionId) {
      return request(`/api/sessions/${encodeURIComponent(sessionId)}`);
    },

    async deleteSession(sessionId) {
      return request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    },

    /**
     * Chat and Agent execution
     */
    async sendMessage(message, sessionId = null) {
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
    },

    /**
     * Human-In-The-Loop Approval
     */
    async submitHITLApproval(sessionId, approved) {
      return request(`/api/hitl/${encodeURIComponent(sessionId)}/approve`, {
        method: "POST",
        body: JSON.stringify({ approved: Boolean(approved) }),
      });
    },

    /**
     * Diagnostics & Remediation Tools
     */
    async listDiagnosticTools() {
      return request("/api/diagnostics/tools");
    },

    async runDiagnostic(toolName, args = {}) {
      return request("/api/diagnostics/run", {
        method: "POST",
        body: JSON.stringify({
          tool_name: toolName,
          args,
        }),
      });
    },

    /**
     * Knowledge Base & SOPs
     */
    async listKnowledgeDocuments() {
      return request("/api/knowledge/documents");
    },

    async uploadKnowledgeDocument(docData) {
      return request("/api/knowledge/upload", {
        method: "POST",
        body: JSON.stringify(docData),
      });
    },

    async rebuildKnowledgeBase() {
      return request("/api/knowledge/rebuild", {
        method: "POST",
      });
    },
  };

  global.ITSupportAPI = ITSupportAPI;
})(typeof window !== "undefined" ? window : globalThis);
