/**
 * Backend API Client for the IT Support Agent.
 * Handles all communication with the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Create a new support session.
 * @returns {Promise<{session_id: string}>}
 */
export async function createSession() {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);
  return res.json();
}

/**
 * Send a chat message to the agent.
 * @param {string} message - The user's message
 * @param {string|null} sessionId - The session ID (optional, will create if null)
 * @returns {Promise<{response: string, session_id: string, metadata: object}>}
 */
export async function sendMessage(message, sessionId = null) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      session_id: sessionId,
    }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Chat failed: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Approve or decline a HITL action.
 * @param {string} sessionId - The session ID
 * @param {boolean} approved - Whether the action is approved
 * @returns {Promise<{response: string, session_id: string, metadata: object}>}
 */
export async function submitHITLApproval(sessionId, approved) {
  const res = await fetch(`${API_BASE}/api/hitl/${sessionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) throw new Error(`HITL approval failed: ${res.statusText}`);
  return res.json();
}

/**
 * Get all active sessions.
 * @returns {Promise<Array<{session_id: string, user_id: string, message_count: number, resolved: boolean}>>}
 */
export async function listSessions() {
  const res = await fetch(`${API_BASE}/api/sessions`);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`);
  return res.json();
}

/**
 * Get session details and message history.
 * @param {string} sessionId
 * @returns {Promise<{session_id: string, messages: Array, metadata: object}>}
 */
export async function getSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to get session: ${res.statusText}`);
  return res.json();
}

/**
 * Health check.
 * @returns {Promise<{status: string}>}
 */
export async function healthCheck() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Backend is not healthy");
  return res.json();
}
