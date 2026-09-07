/**
 * IT Support Agent — Vanilla Frontend Client
 * Interacts with FastAPI backend endpoints: /api/chat, /api/sessions, /api/hitl
 */

(function () {
  // State
  let sessions = [];
  let activeSessionId = null;
  let messages = [];
  let isLoading = false;
  let currentMetadata = null;
  let isBackendOnline = true;

  // DOM Elements
  const sessionListEl = document.getElementById("session-list");
  const newChatBtn = document.getElementById("new-chat-btn");
  const welcomeScreenEl = document.getElementById("welcome-screen");
  const chatMessagesEl = document.getElementById("chat-messages");
  const messagesAnchorEl = document.getElementById("messages-anchor");
  const chatFormEl = document.getElementById("chat-form");
  const chatInputEl = document.getElementById("chat-input");
  const sendBtnEl = document.getElementById("send-btn");
  const typingIndicatorEl = document.getElementById("typing-indicator");
  const headerStatusEl = document.getElementById("header-status");
  const headerSopBadgeEl = document.getElementById("header-sop-badge");
  const backendOfflineBanner = document.getElementById("backend-offline-banner");
  const hitlModalEl = document.getElementById("hitl-modal");
  const hitlModalDescEl = document.getElementById("hitl-modal-desc");
  const hitlApproveBtn = document.getElementById("hitl-approve-btn");
  const hitlDeclineBtn = document.getElementById("hitl-decline-btn");

  // Initialize
  async function init() {
    setupEventListeners();
    await checkHealth();
    setInterval(checkHealth, 15000);
    await loadSessions();
  }

  // Health check
  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      isBackendOnline = res.ok;
    } catch {
      isBackendOnline = false;
    }
    updateStatusUI();
  }

  function updateStatusUI() {
    if (isBackendOnline) {
      headerStatusEl.textContent = "Agent Online";
      headerStatusEl.style.color = "var(--status-success)";
      backendOfflineBanner.style.display = "none";
      sendBtnEl.disabled = isLoading || !chatInputEl.value.trim();
    } else {
      headerStatusEl.textContent = "Agent Offline";
      headerStatusEl.style.color = "var(--status-error)";
      backendOfflineBanner.style.display = "block";
    }
  }

  // Events
  function setupEventListeners() {
    chatFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = chatInputEl.value.trim();
      if (!text || isLoading) return;
      await handleSendMessage(text);
    });

    chatInputEl.addEventListener("input", () => {
      sendBtnEl.disabled = isLoading || !chatInputEl.value.trim();
    });

    newChatBtn.addEventListener("click", () => {
      handleNewChat();
    });

    // Suggestions click
    document.querySelectorAll(".suggestion-card").forEach((card) => {
      card.addEventListener("click", () => {
        const prompt = card.getAttribute("data-prompt");
        if (prompt) {
          handleSendMessage(prompt);
        }
      });
    });

    // HITL Buttons
    hitlApproveBtn.addEventListener("click", () => handleHITLResponse(true));
    hitlDeclineBtn.addEventListener("click", () => handleHITLResponse(false));
  }

  // Create Session
  async function handleNewChat() {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      const newSession = {
        id: data.session_id,
        title: "New Support Session",
        messageCount: 0,
        resolved: false,
      };
      sessions.unshift(newSession);
      activeSessionId = data.session_id;
      messages = [];
      currentMetadata = null;
      renderSessions();
      renderChat();
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }

  // Load Sessions
  async function loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        sessions = data.map((s) => ({
          id: s.session_id,
          title: "Session " + s.session_id.slice(0, 8),
          messageCount: s.message_count || 0,
          resolved: s.resolved || false,
        }));
        renderSessions();
      }
    } catch (err) {
      console.warn("Could not load sessions:", err);
    }
  }

  // Render Session List
  function renderSessions() {
    if (sessions.length === 0) {
      sessionListEl.innerHTML = `
        <p style="font-size: 12px; color: var(--text-tertiary); padding: 12px 8px; line-height: 1.6;">
          No sessions yet. Click "New Support Session" or start typing to begin.
        </p>
      `;
      return;
    }

    sessionListEl.innerHTML = "";
    sessions.forEach((s) => {
      const item = document.createElement("div");
      item.className = `session-item ${s.id === activeSessionId ? "active" : ""}`;
      item.id = `session-${s.id.slice(0, 8)}`;
      item.innerHTML = `
        <span class="session-icon">${s.resolved ? "✅" : "💬"}</span>
        <div class="session-info">
          <div class="session-title">${escapeHtml(s.title)}</div>
          <div class="session-meta">
            ${s.messageCount} messages ${s.resolved ? "· Resolved" : ""}
          </div>
        </div>
      `;
      item.addEventListener("click", () => selectSession(s.id));
      sessionListEl.appendChild(item);
    });
  }

  // Switch session
  async function selectSession(sessionId) {
    if (sessionId === activeSessionId) return;
    activeSessionId = sessionId;
    renderSessions();
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        messages = (data.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date().toISOString(),
        }));
        currentMetadata = data.metadata || null;
      } else {
        messages = [];
        currentMetadata = null;
      }
    } catch {
      messages = [];
      currentMetadata = null;
    }
    renderChat();
  }

  // Send Message
  async function handleSendMessage(text) {
    if (!text || isLoading) return;

    if (!activeSessionId) {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        activeSessionId = data.session_id;
        sessions.unshift({
          id: activeSessionId,
          title: text.slice(0, 45) + (text.length > 45 ? "..." : ""),
          messageCount: 0,
          resolved: false,
        });
        renderSessions();
      } catch (err) {
        console.error("Failed to auto-create session:", err);
      }
    }

    // User Message
    messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    chatInputEl.value = "";
    sendBtnEl.disabled = true;
    isLoading = true;
    renderChat();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: activeSessionId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || res.statusText);
      }

      const result = await res.json();
      currentMetadata = result.metadata || null;

      messages.push({
        role: "assistant",
        content: result.response,
        timestamp: new Date().toISOString(),
        metadata: result.metadata,
      });

      // Update session title & resolved status
      const session = sessions.find((s) => s.id === activeSessionId);
      if (session) {
        session.messageCount += 2;
        if (result.metadata?.resolved) session.resolved = true;
        renderSessions();
      }

      // Check HITL
      if (result.metadata?.requires_hitl) {
        hitlModalDescEl.textContent = result.response;
        hitlModalEl.style.display = "flex";
      }
    } catch (err) {
      messages.push({
        role: "assistant",
        content: "⚠️ I encountered an error communicating with the agent:\n\n" + err.message,
        timestamp: new Date().toISOString(),
        isError: true,
      });
    } finally {
      isLoading = false;
      renderChat();
    }
  }

  // Handle HITL Approval
  async function handleHITLResponse(approved) {
    hitlModalEl.style.display = "none";
    if (!activeSessionId) return;

    isLoading = true;
    renderChat();

    try {
      const res = await fetch(`/api/hitl/${activeSessionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const result = await res.json();
      currentMetadata = result.metadata || null;

      messages.push({
        role: "assistant",
        content: result.response,
        timestamp: new Date().toISOString(),
        metadata: result.metadata,
      });
    } catch (err) {
      console.error("HITL error:", err);
    } finally {
      isLoading = false;
      renderChat();
    }
  }

  // Render Chat Window
  function renderChat() {
    if (messages.length === 0) {
      welcomeScreenEl.style.display = "flex";
      chatMessagesEl.style.display = "none";
      headerSopBadgeEl.style.display = "none";
      typingIndicatorEl.style.display = "none";
      return;
    }

    welcomeScreenEl.style.display = "none";
    chatMessagesEl.style.display = "flex";

    // Update Header SOP badge
    if (currentMetadata?.sop_title) {
      headerSopBadgeEl.textContent = `📋 ${currentMetadata.sop_title}`;
      headerSopBadgeEl.style.display = "inline-block";
    } else {
      headerSopBadgeEl.style.display = "none";
    }

    // Render messages
    chatMessagesEl.innerHTML = "";

    messages.forEach((msg, idx) => {
      const isUser = msg.role === "user";
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

      const msgWrap = document.createElement("div");

      const bubble = document.createElement("div");
      bubble.className = `message ${isUser ? "message-user" : "message-assistant"}`;
      bubble.innerHTML = `
        <div class="message-avatar">${isUser ? "👤" : "🤖"}</div>
        <div>
          <div class="message-content">${formatMarkdown(msg.content)}</div>
          ${time ? `<div class="message-timestamp">${time}</div>` : ""}
        </div>
      `;
      msgWrap.appendChild(bubble);

      // Tool Cards
      if (
        !isUser &&
        msg.metadata?.diagnostic_results &&
        msg.metadata.diagnostic_results.length > 0
      ) {
        const toolCardContainer = document.createElement("div");
        toolCardContainer.className = "message-assistant";
        toolCardContainer.style.maxWidth = "85%";
        toolCardContainer.style.marginTop = "-8px";
        toolCardContainer.innerHTML = `
          <div style="margin-left: 48px;">
            ${renderToolCardsHtml(msg.metadata.diagnostic_results)}
          </div>
        `;
        msgWrap.appendChild(toolCardContainer);
      }

      // Step Tracker
      if (
        !isUser &&
        msg.metadata?.has_sop &&
        msg.metadata?.total_steps > 0 &&
        idx === messages.length - 1
      ) {
        const stepContainer = document.createElement("div");
        stepContainer.className = "message-assistant";
        stepContainer.style.maxWidth = "85%";
        stepContainer.style.marginTop = "-8px";
        stepContainer.innerHTML = `
          <div style="margin-left: 48px;">
            ${renderStepTrackerHtml(
              msg.metadata.current_step,
              msg.metadata.total_steps,
              msg.metadata.sop_title
            )}
          </div>
        `;
        msgWrap.appendChild(stepContainer);
      }

      // Ticket Card
      if (!isUser && msg.metadata?.ticket_info) {
        const ticketContainer = document.createElement("div");
        ticketContainer.className = "message-assistant";
        ticketContainer.style.maxWidth = "85%";
        ticketContainer.style.marginTop = "-8px";
        ticketContainer.innerHTML = `
          <div style="margin-left: 48px;">
            ${renderTicketCardHtml(msg.metadata.ticket_info)}
          </div>
        `;
        msgWrap.appendChild(ticketContainer);
      }

      chatMessagesEl.appendChild(msgWrap);
    });

    // Typing indicator
    if (isLoading) {
      typingIndicatorEl.style.display = "flex";
      chatMessagesEl.appendChild(typingIndicatorEl);
    } else {
      typingIndicatorEl.style.display = "none";
    }

    // Scroll to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  // Markdown Parser
  function formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Headers
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");

    // Bold & Italic
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Inline Code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Lists
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*?<\/li>)+/gs, (m) => `<ul>${m}</ul>`);

    // Paragraphs & Linebreaks
    html = html.replace(/\n\n/g, "</p><p>");
    html = html.replace(/\n/g, "<br/>");
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, "");
    html = html.replace(/<p>(<h[23]>)/g, "$1");
    html = html.replace(/(<\/h[23]>)<\/p>/g, "$1");
    html = html.replace(/<p>(<ul>)/g, "$1");
    html = html.replace(/(<\/ul>)<\/p>/g, "$1");

    return html;
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderToolCardsHtml(results) {
    return `
      <div class="tool-cards">
        ${results
          .map((r, i) => {
            const isSuccess =
              r.result?.is_healthy || r.result?.reachable || r.result?.status === "success";
            const isError =
              r.result?.error || r.result?.status === "degraded" || r.result?.reachable === false;
            let statusEmoji = isSuccess ? "✅" : isError ? "❌" : "🔍";

            let summary = r.result?.message || (r.result?.error ? `Error: ${r.result.error}` : `Status: ${r.result?.status || "OK"}`);
            if (r.result?.latency_ms) summary += ` (${r.result.latency_ms}ms)`;

            const toolFormatted = (r.tool || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const argsStr = r.args && Object.keys(r.args).length > 0 ? `(${Object.values(r.args).join(", ")})` : "";

            return `
              <div class="tool-card" id="tool-card-${i}">
                <span class="tool-card-icon">🔧</span>
                <div class="tool-card-info">
                  <div class="tool-card-name">
                    ${escapeHtml(toolFormatted)}
                    ${argsStr ? `<span style="font-weight: 400; color: var(--text-tertiary); margin-left: 4px;">${escapeHtml(argsStr)}</span>` : ""}
                  </div>
                  <div class="tool-card-result">${escapeHtml(summary)}</div>
                </div>
                <span class="tool-card-status">${statusEmoji}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderStepTrackerHtml(currentStep, totalSteps, sopTitle) {
    const progress = Math.min(((currentStep + 1) / totalSteps) * 100, 100);
    const stepsHtml = Array.from({ length: totalSteps }, (_, i) => {
      let status = i < currentStep ? "completed" : i === currentStep ? "active" : "pending";
      let label = `Step ${i + 1}${status === "completed" ? " — Done" : status === "active" ? " — In Progress" : ""}`;
      return `
        <div class="step-item ${status}">
          <div class="step-dot"></div>
          <span>${label}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="step-tracker" id="step-tracker">
        <div class="step-tracker-header">
          <span class="step-tracker-title">📋 Resolution Progress</span>
          <span class="step-tracker-progress">Step ${Math.min(currentStep + 1, totalSteps)} of ${totalSteps}</span>
        </div>
        <div class="step-progress-bar">
          <div class="step-progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="step-list">${stepsHtml}</div>
        ${
          sopTitle
            ? `<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-subtle); font-size: 11px; color: var(--text-tertiary);">Procedure: ${escapeHtml(sopTitle)}</div>`
            : ""
        }
      </div>
    `;
  }

  function renderTicketCardHtml(ticket) {
    const pColor =
      ticket.priority === "P1"
        ? "var(--status-error)"
        : ticket.priority === "P2"
        ? "var(--status-warning)"
        : "var(--status-info)";

    return `
      <div class="ticket-card" id="ticket-card">
        <div class="ticket-card-header">
          <span style="font-size: 18px;">📋</span>
          <h4>Support Ticket Created</h4>
        </div>
        <div class="ticket-details">
          <div class="ticket-field">
            <span class="ticket-field-label">Ticket ID</span>
            <span class="ticket-field-value">${escapeHtml(ticket.ticket_id || "N/A")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Priority</span>
            <span class="ticket-field-value" style="color: ${pColor};">${escapeHtml(ticket.priority || "P3")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Assigned Team</span>
            <span class="ticket-field-value">${escapeHtml(ticket.assigned_team || "IT Support")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Expected Response</span>
            <span class="ticket-field-value">${escapeHtml(ticket.estimated_response || "TBD")}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Start app
  document.addEventListener("DOMContentLoaded", init);
})();
