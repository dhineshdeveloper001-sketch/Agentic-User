/**
 * IT Support Agent — Frontend Application Controller
 * Connects the polished UI to FastAPI & LangGraph via window.ITSupportAPI.
 * Features:
 *  - Multiview Navigation (Chat, Knowledge Base, Diagnostics, History)
 *  - Real Backend RAG Sources Display (collapsible)
 *  - Real Deterministic Tool Calling UI & Diagnostics Console
 *  - Real Knowledge Base Document Management & Upload
 *  - Human-In-The-Loop (HITL) Security Approval Flow
 *  - Chat History & Session Management with Deletion
 *  - Mobile-responsive drawer navigation
 */

(function () {
  // State
  let sessions = [];
  let activeSessionId = null;
  let messages = [];
  let currentMetadata = null;
  let isLoading = false;
  let isBackendOnline = true;
  let currentView = "chat";
  let kbDocuments = [];
  let diagnosticTools = [];

  // DOM Elements
  const sidebarEl = document.getElementById("sidebar");
  const sidebarBackdropEl = document.getElementById("sidebar-backdrop");
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const historyNewChatBtn = document.getElementById("history-new-chat-btn");
  const refreshSessionsBtn = document.getElementById("refresh-sessions-btn");
  const sessionListEl = document.getElementById("session-list");
  const sessionCountBadge = document.getElementById("session-count-badge");
  const footerStatusDot = document.getElementById("footer-status-dot");
  const footerStatusText = document.getElementById("footer-status-text");
  const agentStatusBadge = document.getElementById("agent-status-badge");
  const agentStatusLabel = document.getElementById("agent-status-label");
  const backendOfflineBanner = document.getElementById("backend-offline-banner");
  const headerSopBadgeEl = document.getElementById("header-sop-badge");
  const currentSessionTag = document.getElementById("current-session-tag");

  // Views
  const views = {
    chat: document.getElementById("view-chat"),
    knowledge: document.getElementById("view-knowledge"),
    diagnostics: document.getElementById("view-diagnostics"),
    history: document.getElementById("view-history"),
  };

  // Nav Buttons
  const navBtns = {
    chat: document.getElementById("nav-chat-btn"),
    knowledge: document.getElementById("nav-kb-btn"),
    diagnostics: document.getElementById("nav-diag-btn"),
    history: document.getElementById("nav-history-btn"),
  };

  const headerTabs = {
    chat: document.getElementById("tab-chat"),
    knowledge: document.getElementById("tab-knowledge"),
    diagnostics: document.getElementById("tab-diagnostics"),
  };

  // Chat Elements
  const welcomeScreenEl = document.getElementById("welcome-screen");
  const chatMessagesEl = document.getElementById("chat-messages");
  const typingIndicatorEl = document.getElementById("typing-indicator");
  const typingStatusText = document.getElementById("typing-status-text");
  const chatFormEl = document.getElementById("chat-form");
  const chatInputEl = document.getElementById("chat-input");
  const sendBtnEl = document.getElementById("send-btn");

  // Knowledge Base Elements
  const kbGridEl = document.getElementById("kb-grid");
  const kbSearchInput = document.getElementById("kb-search-input");
  const kbDocCountEl = document.getElementById("kb-doc-count");
  const rebuildKbBtn = document.getElementById("rebuild-kb-btn");
  const openUploadModalBtn = document.getElementById("open-upload-modal-btn");
  const uploadDocModal = document.getElementById("upload-doc-modal");
  const closeUploadModalBtn = document.getElementById("close-upload-modal-btn");
  const cancelUploadBtn = document.getElementById("cancel-upload-btn");
  const uploadDocForm = document.getElementById("upload-doc-form");
  const uploadStatusIndicator = document.getElementById("upload-status-indicator");
  const uploadStatusText = document.getElementById("upload-status-text");

  // Diagnostics Elements
  const diagnosticsGridEl = document.getElementById("diagnostics-grid");
  const refreshToolsBtn = document.getElementById("refresh-tools-btn");
  const diagOutputContainer = document.getElementById("diag-output-container");
  const diagOutputContent = document.getElementById("diag-output-content");
  const diagOutputClearBtn = document.getElementById("diag-output-clear");

  // Full History Elements
  const historyFullListEl = document.getElementById("history-full-list");

  // HITL Modal
  const hitlModalEl = document.getElementById("hitl-modal");
  const hitlModalDescEl = document.getElementById("hitl-modal-desc");
  const hitlApproveBtn = document.getElementById("hitl-approve-btn");
  const hitlDeclineBtn = document.getElementById("hitl-decline-btn");

  // ── Initialization ──────────────────────────────────────────────────────────
  async function init() {
    setupEventListeners();
    await checkHealth();
    setInterval(checkHealth, 15000);

    // Initial data fetch
    await loadSessions();
    loadKnowledgeBaseDocuments();
    loadDiagnosticsTools();
  }

  // ── View Switching ──────────────────────────────────────────────────────────
  function switchView(viewName) {
    if (!views[viewName]) return;
    currentView = viewName;

    // Toggle panels
    Object.keys(views).forEach((v) => {
      if (views[v]) {
        views[v].style.display = v === viewName ? "flex" : "none";
        views[v].classList.toggle("active", v === viewName);
      }
    });

    // Update Sidebar Navigation
    Object.keys(navBtns).forEach((v) => {
      if (navBtns[v]) {
        navBtns[v].classList.toggle("active", v === viewName);
      }
    });

    // Update Header Tabs
    Object.keys(headerTabs).forEach((v) => {
      if (headerTabs[v]) {
        headerTabs[v].classList.toggle("active", v === viewName);
      }
    });

    // Close mobile drawer if open
    closeMobileSidebar();

    // Contextual refresh
    if (viewName === "knowledge") {
      loadKnowledgeBaseDocuments();
    } else if (viewName === "diagnostics") {
      loadDiagnosticsTools();
    } else if (viewName === "history") {
      renderFullHistoryList();
    } else if (viewName === "chat") {
      chatInputEl.focus();
    }
  }

  function toggleMobileSidebar() {
    sidebarEl.classList.toggle("open");
    sidebarBackdropEl.classList.toggle("active");
  }

  function closeMobileSidebar() {
    sidebarEl.classList.remove("open");
    sidebarBackdropEl.classList.remove("active");
  }

  // ── Health Check ────────────────────────────────────────────────────────────
  async function checkHealth() {
    try {
      const data = await window.ITSupportAPI.checkHealth();
      isBackendOnline = data && data.status === "healthy";
    } catch {
      isBackendOnline = false;
    }
    updateHealthUI();
  }

  function updateHealthUI() {
    if (isBackendOnline) {
      footerStatusDot.className = "status-indicator-dot";
      footerStatusText.textContent = "Agent Online";
      agentStatusLabel.textContent = "Online";
      agentStatusBadge.style.color = "var(--success)";
      backendOfflineBanner.style.display = "none";
      sendBtnEl.disabled = isLoading || !chatInputEl.value.trim();
    } else {
      footerStatusDot.className = "status-indicator-dot error";
      footerStatusText.textContent = "Backend Offline";
      agentStatusLabel.textContent = "Offline";
      agentStatusBadge.style.color = "var(--error)";
      backendOfflineBanner.style.display = "block";
    }
  }

  // ── Event Listeners Setup ───────────────────────────────────────────────────
  function setupEventListeners() {
    // Navigation items
    Object.keys(navBtns).forEach((v) => {
      if (navBtns[v]) {
        navBtns[v].addEventListener("click", () => switchView(v));
      }
    });

    Object.keys(headerTabs).forEach((v) => {
      if (headerTabs[v]) {
        headerTabs[v].addEventListener("click", () => switchView(v));
      }
    });

    // Mobile drawer toggle
    menuToggleBtn.addEventListener("click", toggleMobileSidebar);
    sidebarBackdropEl.addEventListener("click", closeMobileSidebar);

    // New Chat buttons
    newChatBtn.addEventListener("click", handleNewChat);
    historyNewChatBtn?.addEventListener("click", () => {
      handleNewChat();
      switchView("chat");
    });

    // Refresh Sessions
    refreshSessionsBtn.addEventListener("click", loadSessions);

    // Chat form submit
    chatFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = chatInputEl.value.trim();
      if (!text || isLoading) return;
      await handleSendMessage(text);
    });

    // Textarea input auto-grow & keyboard handling
    chatInputEl.addEventListener("input", () => {
      chatInputEl.style.height = "auto";
      chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 140) + "px";
      sendBtnEl.disabled = isLoading || !chatInputEl.value.trim();
    });

    chatInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = chatInputEl.value.trim();
        if (text && !isLoading) {
          handleSendMessage(text);
        }
      }
    });

    // Suggestion cards click in Welcome View
    document.querySelectorAll(".suggestion-card").forEach((card) => {
      card.addEventListener("click", () => {
        const prompt = card.getAttribute("data-prompt");
        if (prompt) {
          handleSendMessage(prompt);
        }
      });
    });

    // Category pills click
    document.querySelectorAll(".category-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const prompt = pill.getAttribute("data-prompt");
        if (prompt) {
          chatInputEl.value = prompt;
          chatInputEl.focus();
          sendBtnEl.disabled = false;
        }
      });
    });

    // HITL modal buttons
    hitlApproveBtn.addEventListener("click", () => handleHITLResponse(true));
    hitlDeclineBtn.addEventListener("click", () => handleHITLResponse(false));

    // Knowledge base events
    rebuildKbBtn?.addEventListener("click", handleRebuildKnowledgeBase);
    openUploadModalBtn?.addEventListener("click", () => {
      uploadDocModal.style.display = "flex";
      uploadDocForm.reset();
      uploadStatusIndicator.style.display = "none";
    });
    closeUploadModalBtn?.addEventListener("click", () => {
      uploadDocModal.style.display = "none";
    });
    cancelUploadBtn?.addEventListener("click", () => {
      uploadDocModal.style.display = "none";
    });
    uploadDocForm?.addEventListener("submit", handleUploadDocument);
    kbSearchInput?.addEventListener("input", filterKnowledgeBaseGrid);

    // Diagnostics events
    refreshToolsBtn?.addEventListener("click", loadDiagnosticsTools);
    diagOutputClearBtn?.addEventListener("click", () => {
      diagOutputContainer.style.display = "none";
    });
  }

  // ── Session Management ──────────────────────────────────────────────────────
  async function handleNewChat() {
    try {
      const data = await window.ITSupportAPI.createSession();
      activeSessionId = data.session_id;
      const newSession = {
        id: data.session_id,
        title: "New Support Session",
        messageCount: 0,
        resolved: false,
      };
      sessions.unshift(newSession);
      messages = [];
      currentMetadata = null;
      renderSidebarSessions();
      renderChat();
      updateSessionCount();
      if (currentView !== "chat") switchView("chat");
    } catch (err) {
      console.error("Failed to create session:", err);
      // Fallback: reset local state
      activeSessionId = null;
      messages = [];
      currentMetadata = null;
      renderChat();
    }
  }

  async function loadSessions() {
    try {
      const data = await window.ITSupportAPI.listSessions();
      if (Array.isArray(data)) {
        sessions = data.map((s) => ({
          id: s.session_id,
          title: "Session " + s.session_id.slice(0, 8),
          messageCount: s.message_count || 0,
          resolved: s.resolved || false,
        }));
        renderSidebarSessions();
        updateSessionCount();
      }
    } catch (err) {
      console.warn("Could not load sessions:", err);
    }
  }

  function updateSessionCount() {
    if (sessionCountBadge) {
      sessionCountBadge.textContent = sessions.length;
    }
  }

  function renderSidebarSessions() {
    if (sessions.length === 0) {
      sessionListEl.innerHTML = `
        <p class="empty-state-text">
          No active conversations.<br/>Click <strong>New Chat</strong> to begin.
        </p>
      `;
      return;
    }

    sessionListEl.innerHTML = "";
    sessions.forEach((s) => {
      const item = document.createElement("div");
      item.className = `session-item ${s.id === activeSessionId ? "active" : ""}`;
      item.id = `session-item-${s.id.slice(0, 8)}`;
      item.innerHTML = `
        <span class="session-item-icon">${s.resolved ? "✅" : "💬"}</span>
        <div class="session-item-info">
          <div class="session-item-title">${escapeHtml(s.title)}</div>
          <div class="session-item-meta">
            ${s.messageCount} msgs ${s.resolved ? "· Resolved" : ""}
          </div>
        </div>
        <button class="session-delete-btn" title="Delete conversation" data-id="${s.id}">✕</button>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("session-delete-btn")) {
          e.stopPropagation();
          deleteSessionItem(s.id);
          return;
        }
        selectSession(s.id);
      });

      sessionListEl.appendChild(item);
    });
  }

  async function deleteSessionItem(sessionId) {
    try {
      await window.ITSupportAPI.deleteSession(sessionId);
      sessions = sessions.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        activeSessionId = null;
        messages = [];
        currentMetadata = null;
        renderChat();
      }
      renderSidebarSessions();
      updateSessionCount();
      if (currentView === "history") renderFullHistoryList();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  async function selectSession(sessionId) {
    if (sessionId === activeSessionId && currentView === "chat") return;
    activeSessionId = sessionId;
    renderSidebarSessions();

    try {
      const data = await window.ITSupportAPI.getSession(sessionId);
      messages = (data.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
      }));
      currentMetadata = data.metadata || null;
    } catch {
      messages = [];
      currentMetadata = null;
    }

    renderChat();
    switchView("chat");
  }

  // ── Chat Messaging ──────────────────────────────────────────────────────────
  async function handleSendMessage(text) {
    if (!text || isLoading) return;

    // Auto-create session if needed
    if (!activeSessionId) {
      try {
        const data = await window.ITSupportAPI.createSession();
        activeSessionId = data.session_id;
        sessions.unshift({
          id: activeSessionId,
          title: text.slice(0, 42) + (text.length > 42 ? "..." : ""),
          messageCount: 0,
          resolved: false,
        });
        renderSidebarSessions();
        updateSessionCount();
      } catch (err) {
        console.error("Auto session creation failed:", err);
      }
    }

    // Add user message
    messages.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    // Reset input
    chatInputEl.value = "";
    chatInputEl.style.height = "auto";
    sendBtnEl.disabled = true;
    isLoading = true;

    // Show appropriate loading state
    typingStatusText.textContent = "AI is thinking...";
    renderChat();

    // After 1.5s if still loading, indicate diagnostic / RAG search
    const statusTimer = setTimeout(() => {
      if (isLoading) {
        typingStatusText.textContent = "Searching knowledge base & running diagnostics...";
      }
    }, 1200);

    try {
      const result = await window.ITSupportAPI.sendMessage(text, activeSessionId);
      clearTimeout(statusTimer);

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
        if (session.messageCount === 0) {
          session.title = text.slice(0, 42) + (text.length > 42 ? "..." : "");
        }
        session.messageCount += 2;
        if (result.metadata?.resolved) session.resolved = true;
        renderSidebarSessions();
      }

      // Check HITL requirement
      if (result.metadata?.requires_hitl) {
        hitlModalDescEl.textContent = result.response;
        hitlModalEl.style.display = "flex";
      }
    } catch (err) {
      clearTimeout(statusTimer);
      let friendlyError = "Unable to connect to the IT support service. Please try again.";
      if (err.message && !err.isNetworkError) {
        friendlyError = `⚠️ IT Support Service Notice: ${err.message}`;
      }
      messages.push({
        role: "assistant",
        content: friendlyError,
        timestamp: new Date().toISOString(),
        isError: true,
      });
    } finally {
      isLoading = false;
      renderChat();
    }
  }

  // ── HITL Approval ───────────────────────────────────────────────────────────
  async function handleHITLResponse(approved) {
    hitlModalEl.style.display = "none";
    if (!activeSessionId) return;

    isLoading = true;
    typingStatusText.textContent = approved
      ? "Executing approved remediation action..."
      : "Escalating incident to Tier-2 support...";
    renderChat();

    try {
      const result = await window.ITSupportAPI.submitHITLApproval(activeSessionId, approved);
      currentMetadata = result.metadata || null;

      messages.push({
        role: "assistant",
        content: result.response,
        timestamp: new Date().toISOString(),
        metadata: result.metadata,
      });
    } catch (err) {
      console.error("HITL error:", err);
      messages.push({
        role: "assistant",
        content: "⚠️ Failed to record approval response: " + err.message,
        timestamp: new Date().toISOString(),
        isError: true,
      });
    } finally {
      isLoading = false;
      renderChat();
    }
  }

  // ── Chat Rendering ──────────────────────────────────────────────────────────
  function renderChat() {
    currentSessionTag.textContent = activeSessionId
      ? `Session: ${activeSessionId.slice(0, 8)}`
      : "Session: Auto";

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
      headerSopBadgeEl.style.display = "inline-flex";
    } else {
      headerSopBadgeEl.style.display = "none";
    }

    // Render Messages
    chatMessagesEl.innerHTML = "";

    messages.forEach((msg, idx) => {
      const isUser = msg.role === "user";
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

      const msgRow = document.createElement("div");
      msgRow.className = "message-row";

      const bubbleWrap = document.createElement("div");
      bubbleWrap.className = `message ${isUser ? "message-user" : "message-assistant"}`;

      bubbleWrap.innerHTML = `
        <div class="message-avatar">${isUser ? "👤" : "🤖"}</div>
        <div class="message-bubble-wrapper">
          <div class="message-bubble">${formatMarkdown(msg.content)}</div>
          ${time ? `<div class="message-timestamp">${time}</div>` : ""}
        </div>
      `;
      msgRow.appendChild(bubbleWrap);

      // Render RAG Sources if present in assistant message
      if (!isUser && msg.metadata?.sources && msg.metadata.sources.length > 0) {
        const sourcesNode = document.createElement("div");
        sourcesNode.className = "chat-component-wrap";
        sourcesNode.innerHTML = renderSourcesHtml(msg.metadata.sources);

        // Attach toggle listener
        const card = sourcesNode.querySelector(".sources-card");
        const header = sourcesNode.querySelector(".sources-header");
        header?.addEventListener("click", () => {
          card.classList.toggle("open");
        });

        msgRow.appendChild(sourcesNode);
      }

      // Render Diagnostic Tool execution results if present
      if (
        !isUser &&
        msg.metadata?.diagnostic_results &&
        msg.metadata.diagnostic_results.length > 0
      ) {
        const toolsNode = document.createElement("div");
        toolsNode.className = "chat-component-wrap";
        toolsNode.innerHTML = renderToolResultsHtml(msg.metadata.diagnostic_results);
        msgRow.appendChild(toolsNode);
      }

      // Render Step Tracker on latest message if SOP active
      if (
        !isUser &&
        msg.metadata?.has_sop &&
        msg.metadata?.total_steps > 0 &&
        idx === messages.length - 1
      ) {
        const stepsNode = document.createElement("div");
        stepsNode.className = "chat-component-wrap";
        stepsNode.innerHTML = renderStepTrackerHtml(
          msg.metadata.current_step,
          msg.metadata.total_steps,
          msg.metadata.sop_title
        );
        msgRow.appendChild(stepsNode);
      }

      // Render Ticket Card if escalated
      if (!isUser && msg.metadata?.ticket_info) {
        const ticketNode = document.createElement("div");
        ticketNode.className = "chat-component-wrap";
        ticketNode.innerHTML = renderTicketCardHtml(msg.metadata.ticket_info);
        msgRow.appendChild(ticketNode);
      }

      chatMessagesEl.appendChild(msgRow);
    });

    // Handle Typing Indicator
    if (isLoading) {
      typingIndicatorEl.style.display = "flex";
      chatMessagesEl.appendChild(typingIndicatorEl);
    } else {
      typingIndicatorEl.style.display = "none";
    }

    // Scroll smoothly to bottom
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  // ── Component Render Helpers ────────────────────────────────────────────────

  function renderSourcesHtml(sources) {
    return `
      <div class="sources-card">
        <div class="sources-header">
          <div class="sources-header-left">
            <span>📚</span>
            <span>Referenced Knowledge Sources (${sources.length})</span>
          </div>
          <span class="sources-toggle-icon">▼</span>
        </div>
        <div class="sources-list">
          ${sources
            .map(
              (s) => `
            <div class="source-item">
              <div class="source-item-title">
                <span>${escapeHtml(s.title || "SOP Runbook")}</span>
                ${s.score ? `<span class="source-item-score">${Math.round(s.score * 100)}% match</span>` : ""}
              </div>
              ${s.snippet ? `<div class="source-item-snippet">${escapeHtml(s.snippet)}</div>` : ""}
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderToolResultsHtml(results) {
    return `
      <div class="tool-status-pill completed">
        <span>✓</span>
        <span>Diagnostic tests executed successfully</span>
      </div>
      <div class="tool-cards-grid">
        ${results
          .map((r) => {
            const isSuccess =
              r.result?.is_healthy || r.result?.reachable || r.result?.status === "operational";
            const isDegraded =
              r.result?.status === "degraded" || r.result?.reachable === false;
            const icon = isSuccess ? "✅" : isDegraded ? "⚠️" : "🔍";

            let summary = r.result?.message || (r.result?.error ? `Error: ${r.result.error}` : `Status: ${r.result?.status || "OK"}`);
            if (r.result?.latency_ms) summary += ` · Latency: ${r.result.latency_ms}ms`;

            const toolName = (r.tool || "").replace(/_/g, " ").toUpperCase();

            return `
              <div class="tool-card">
                <span class="tool-card-icon">${icon}</span>
                <div class="tool-card-info">
                  <div class="tool-card-name">
                    <span>${escapeHtml(toolName)}</span>
                    <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">${escapeHtml(r.purpose || "")}</span>
                  </div>
                  <div class="tool-card-result">${escapeHtml(summary)}</div>
                </div>
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
      const status = i < currentStep ? "completed" : i === currentStep ? "active" : "pending";
      const label = `Step ${i + 1}${status === "completed" ? " — Done" : status === "active" ? " — In Progress" : ""}`;
      return `
        <div class="step-item ${status}">
          <div class="step-dot"></div>
          <span>${label}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="step-tracker">
        <div class="step-tracker-header">
          <span class="step-tracker-title">📋 Resolution Procedure</span>
          <span class="step-tracker-progress">Step ${Math.min(currentStep + 1, totalSteps)} of ${totalSteps}</span>
        </div>
        <div class="step-progress-bar">
          <div class="step-progress-fill" style="width: ${progress}%;"></div>
        </div>
        <div class="step-list">${stepsHtml}</div>
        ${
          sopTitle
            ? `<div style="margin-top: 10px; font-size: 11px; color: var(--text-muted);">Runbook: <strong>${escapeHtml(sopTitle)}</strong></div>`
            : ""
        }
      </div>
    `;
  }

  function renderTicketCardHtml(ticket) {
    const pColor =
      ticket.priority === "P1"
        ? "var(--error)"
        : ticket.priority === "P2"
        ? "var(--warning)"
        : "var(--info)";

    return `
      <div class="ticket-card">
        <div class="ticket-card-header">
          <span style="font-size: 20px;">🎫</span>
          <h4>Incident Ticket Created for Escalation</h4>
        </div>
        <div class="ticket-details">
          <div class="ticket-field">
            <span class="ticket-field-label">Ticket Reference</span>
            <span class="ticket-field-value">${escapeHtml(ticket.ticket_id || "INC-AUTO")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Priority Level</span>
            <span class="ticket-field-value" style="color: ${pColor};">${escapeHtml(ticket.priority || "P3")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Assigned Engineering Team</span>
            <span class="ticket-field-value">${escapeHtml(ticket.assigned_team || "Tier-2 Infrastructure")}</span>
          </div>
          <div class="ticket-field">
            <span class="ticket-field-label">Estimated First Response</span>
            <span class="ticket-field-value">${escapeHtml(ticket.estimated_response || "1-2 Hours")}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Knowledge Base Logic ────────────────────────────────────────────────────
  async function loadKnowledgeBaseDocuments() {
    try {
      kbDocCountEl.textContent = "Loading SOPs...";
      const docs = await window.ITSupportAPI.listKnowledgeDocuments();
      kbDocuments = Array.isArray(docs) ? docs : [];
      renderKnowledgeBaseGrid();
    } catch (err) {
      kbGridEl.innerHTML = `
        <div class="loading-spinner-wrap">
          <span style="color: var(--error);">⚠️ Failed to load SOP documents: ${escapeHtml(err.message)}</span>
        </div>
      `;
    }
  }

  function filterKnowledgeBaseGrid() {
    renderKnowledgeBaseGrid();
  }

  function renderKnowledgeBaseGrid() {
    const term = (kbSearchInput?.value || "").toLowerCase().trim();
    const filtered = kbDocuments.filter((doc) => {
      const matchTitle = (doc.title || "").toLowerCase().includes(term);
      const matchCat = (doc.category || "").toLowerCase().includes(term);
      const matchPlat = (doc.platforms || []).join(" ").toLowerCase().includes(term);
      return matchTitle || matchCat || matchPlat;
    });

    kbDocCountEl.textContent = `${filtered.length} SOP Documents`;

    if (filtered.length === 0) {
      kbGridEl.innerHTML = `
        <div class="loading-spinner-wrap">
          <span>No matching knowledge documents found.</span>
        </div>
      `;
      return;
    }

    kbGridEl.innerHTML = filtered
      .map((doc) => {
        const platformsStr = Array.isArray(doc.platforms) ? doc.platforms.join(", ") : doc.platforms || "All";
        return `
          <div class="kb-card">
            <div class="kb-card-header">
              <h4 class="kb-card-title">${escapeHtml(doc.title)}</h4>
              <span class="kb-card-status">${escapeHtml(doc.status || "Indexed ✓")}</span>
            </div>
            <div class="kb-card-meta">
              <span class="kb-tag">📂 ${escapeHtml(doc.category || "General")}</span>
              <span class="kb-tag">💻 ${escapeHtml(platformsStr)}</span>
              <span class="kb-tag">🔢 ${doc.resolution_steps_count || 0} Steps</span>
            </div>
            <div class="kb-card-footer">
              <span>File: ${escapeHtml(doc.filename || doc.id)}</span>
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="window.__askAboutSop('${escapeHtml(doc.title)}')">
                Ask Agent
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  window.__askAboutSop = function (sopTitle) {
    switchView("chat");
    handleSendMessage(`I need troubleshooting assistance regarding: ${sopTitle}`);
  };

  async function handleRebuildKnowledgeBase() {
    rebuildKbBtn.disabled = true;
    rebuildKbBtn.innerHTML = `<span>⏳</span> Rebuilding...`;
    try {
      await window.ITSupportAPI.rebuildKnowledgeBase();
      await loadKnowledgeBaseDocuments();
    } catch (err) {
      alert("Failed to rebuild knowledge base: " + err.message);
    } finally {
      rebuildKbBtn.disabled = false;
      rebuildKbBtn.innerHTML = `<span>↻</span> Rebuild Index`;
    }
  }

  async function handleUploadDocument(e) {
    e.preventDefault();
    const title = document.getElementById("doc-title-input").value.trim();
    const category = document.getElementById("doc-category-select").value;
    const platformsRaw = document.getElementById("doc-platform-input").value.trim();
    const content = document.getElementById("doc-content-input").value.trim();

    if (!title || !content) return;

    const platforms = platformsRaw ? platformsRaw.split(",").map((p) => p.trim()) : ["Windows"];

    uploadStatusIndicator.style.display = "flex";
    uploadStatusText.textContent = "Uploading document and re-indexing ChromaDB...";

    try {
      await window.ITSupportAPI.uploadKnowledgeDocument({
        title,
        category,
        content,
        platforms,
      });

      uploadStatusText.textContent = "Indexed ✓";
      setTimeout(() => {
        uploadDocModal.style.display = "none";
        loadKnowledgeBaseDocuments();
      }, 700);
    } catch (err) {
      uploadStatusText.textContent = "Upload failed: " + err.message;
    }
  }

  // ── Diagnostics Console ─────────────────────────────────────────────────────
  async function loadDiagnosticsTools() {
    try {
      const tools = await window.ITSupportAPI.listDiagnosticTools();
      diagnosticTools = Array.isArray(tools) ? tools : [];
      renderDiagnosticsGrid();
    } catch (err) {
      diagnosticsGridEl.innerHTML = `
        <div class="loading-spinner-wrap">
          <span style="color: var(--error);">⚠️ Could not load diagnostic tools: ${escapeHtml(err.message)}</span>
        </div>
      `;
    }
  }

  function renderDiagnosticsGrid() {
    if (diagnosticTools.length === 0) {
      diagnosticsGridEl.innerHTML = `
        <div class="loading-spinner-wrap">
          <span>No diagnostic tools available.</span>
        </div>
      `;
      return;
    }

    diagnosticsGridEl.innerHTML = diagnosticTools
      .map((tool) => {
        const paramFields = (tool.parameters || [])
          .map((param) => {
            if (param.type === "select") {
              const opts = (param.options || [])
                .map(
                  (opt) =>
                    `<option value="${opt.value}" ${opt.value === param.default ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
                )
                .join("");
              return `
                <div>
                  <label class="diag-input-label">${escapeHtml(param.label)}</label>
                  <select class="diag-input" id="diag-param-${tool.id}-${param.name}">
                    ${opts}
                  </select>
                </div>
              `;
            }
            return `
              <div>
                <label class="diag-input-label">${escapeHtml(param.label)}</label>
                <input
                  type="text"
                  class="diag-input"
                  id="diag-param-${tool.id}-${param.name}"
                  value="${escapeHtml(param.default || "")}"
                  placeholder="${escapeHtml(param.placeholder || "")}"
                />
              </div>
            `;
          })
          .join("");

        return `
          <div class="diag-card" id="diag-tool-${tool.id}">
            <div class="diag-card-header">
              <div class="diag-card-icon">${tool.icon || "🔧"}</div>
              <div class="diag-card-info">
                <h4>${escapeHtml(tool.name)}</h4>
                <p>${escapeHtml(tool.description)}</p>
              </div>
            </div>
            <div class="diag-card-form">
              ${paramFields}
              <button class="btn btn-primary diag-run-btn" type="button" data-tool-id="${tool.id}">
                <span>▶</span> Run Diagnostic
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Attach click events
    diagnosticTools.forEach((tool) => {
      const btn = document.querySelector(`[data-tool-id="${tool.id}"]`);
      if (btn) {
        btn.addEventListener("click", () => executeDiagnostic(tool));
      }
    });
  }

  async function executeDiagnostic(tool) {
    const btn = document.querySelector(`[data-tool-id="${tool.id}"]`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> Running...`;
    }

    const args = {};
    (tool.parameters || []).forEach((param) => {
      const input = document.getElementById(`diag-param-${tool.id}-${param.name}`);
      if (input) {
        args[param.name] = input.value;
      }
    });

    diagOutputContainer.style.display = "block";
    diagOutputContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: var(--accent-light);">
        <span class="spinner-small"></span>
        <span>Executing ${escapeHtml(tool.name)} against backend infrastructure...</span>
      </div>
    `;

    try {
      const response = await window.ITSupportAPI.runDiagnostic(tool.id, args);
      const res = response.result || {};
      const isHealthy = res.is_healthy || res.reachable || res.status === "operational" || res.status === "success";
      const statusIcon = isHealthy ? "✅" : "⚠️";

      diagOutputContent.innerHTML = `
        <div class="diag-result-card">
          <div class="diag-result-summary">
            <span>${statusIcon}</span>
            <span>${escapeHtml(tool.name)}: ${escapeHtml(res.message || res.status || "Execution Complete")}</span>
          </div>
          ${res.latency_ms ? `<div style="font-size: 12px; color: var(--text-secondary);">Latency: <strong>${res.latency_ms} ms</strong> · Checked: ${new Date(response.timestamp || Date.now()).toLocaleTimeString()}</div>` : ""}
          <pre class="diag-result-raw"><code>${escapeHtml(JSON.stringify(res, null, 2))}</code></pre>
        </div>
      `;
    } catch (err) {
      diagOutputContent.innerHTML = `
        <div style="color: var(--error);">
          <strong>❌ Execution Failed:</strong> ${escapeHtml(err.message)}
        </div>
      `;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>▶</span> Run Diagnostic`;
      }
    }
  }

  // ── Full History View ───────────────────────────────────────────────────────
  function renderFullHistoryList() {
    if (sessions.length === 0) {
      historyFullListEl.innerHTML = `
        <div class="loading-spinner-wrap">
          <span>No saved sessions found. Click <strong>Start New Session</strong> to begin.</span>
        </div>
      `;
      return;
    }

    historyFullListEl.innerHTML = sessions
      .map(
        (s) => `
      <div class="history-card" onclick="window.__loadHistorySession('${s.id}')">
        <div class="history-card-header">
          <h4 class="history-card-title">${escapeHtml(s.title)}</h4>
          <span class="session-item-icon">${s.resolved ? "✅ Resolved" : "💬 Active"}</span>
        </div>
        <p class="history-card-desc">Session identifier: ${escapeHtml(s.id)}</p>
        <div class="history-card-footer">
          <span>${s.messageCount} messages</span>
          <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">Open Session →</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  window.__loadHistorySession = function (sessionId) {
    selectSession(sessionId);
  };

  // ── Markdown Parser ─────────────────────────────────────────────────────────
  function formatMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Code blocks ```code```
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${code}</code></pre>`;
    });

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
    html = html.replace(/<p>(<pre>)/g, "$1");
    html = html.replace(/(<\/pre>)<\/p>/g, "$1");

    return html;
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Start app on DOM ready
  document.addEventListener("DOMContentLoaded", init);
})();
