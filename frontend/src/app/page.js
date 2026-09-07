"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import WelcomeScreen from "../components/WelcomeScreen";
import HITLModal from "../components/HITLModal";
import { createSession, sendMessage, submitHITLApproval } from "../lib/api";

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [showHITL, setShowHITL] = useState(false);
  const [hitlMessage, setHitlMessage] = useState("");
  const [backendOnline, setBackendOnline] = useState(false);
  const messagesEndRef = useRef(null);

  // Check backend health
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") +
            "/api/health"
        );
        setBackendOnline(res.ok);
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Create a new session
  const handleNewChat = useCallback(async () => {
    try {
      const session = await createSession();
      const newSession = {
        id: session.session_id,
        title: "New Support Session",
        messageCount: 0,
        resolved: false,
        createdAt: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(session.session_id);
      setMessages([]);
      setMetadata(null);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, []);

  // Send message to agent
  const handleSendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;

      let sessionId = activeSessionId;

      // Auto-create session if needed
      if (!sessionId) {
        try {
          const session = await createSession();
          sessionId = session.session_id;
          const newSession = {
            id: sessionId,
            title: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
            messageCount: 0,
            resolved: false,
            createdAt: new Date().toISOString(),
          };
          setSessions((prev) => [newSession, ...prev]);
          setActiveSessionId(sessionId);
        } catch (err) {
          console.error("Failed to create session:", err);
          return;
        }
      }

      // Add user message
      const userMsg = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const result = await sendMessage(text, sessionId);

        // Add assistant response
        const aiMsg = {
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
          metadata: result.metadata,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setMetadata(result.metadata);

        // Update session title from first message
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  title:
                    s.messageCount === 0
                      ? text.slice(0, 50) + (text.length > 50 ? "..." : "")
                      : s.title,
                  messageCount: s.messageCount + 2,
                  resolved: result.metadata?.resolved || false,
                }
              : s
          )
        );

        // Check if HITL is needed
        if (result.metadata?.requires_hitl) {
          setHitlMessage(result.response);
          setShowHITL(true);
        }
      } catch (err) {
        const errorMsg = {
          role: "assistant",
          content:
            "⚠️ I'm having trouble connecting to the backend service. Please make sure the backend server is running on port 8000.\n\nError: " +
            err.message,
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, isLoading]
  );

  // Handle HITL approval
  const handleHITLResponse = useCallback(
    async (approved) => {
      setShowHITL(false);
      setIsLoading(true);

      try {
        const result = await submitHITLApproval(activeSessionId, approved);
        const aiMsg = {
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
          metadata: result.metadata,
        };
        setMessages((prev) => [...prev, aiMsg]);
        setMetadata(result.metadata);
      } catch (err) {
        console.error("HITL approval failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId]
  );

  // Handle suggestion card click
  const handleSuggestion = useCallback(
    (text) => {
      handleSendMessage(text);
    },
    [handleSendMessage]
  );

  // Switch sessions
  const handleSessionClick = useCallback(
    (sessionId) => {
      setActiveSessionId(sessionId);
      // In a full implementation, we'd load messages from the backend
      if (sessionId !== activeSessionId) {
        setMessages([]);
        setMetadata(null);
      }
    },
    [activeSessionId]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="app-layout">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onSessionClick={handleSessionClick}
        backendOnline={backendOnline}
      />

      <main className="main-content">
        <header className="chat-header">
          <div className="chat-header-title">
            <span style={{ fontSize: "20px" }}>🛡️</span>
            <h2>IT Support Agent</h2>
            {metadata?.sop_title && (
              <span className="sop-badge">📋 {metadata.sop_title}</span>
            )}
          </div>
          <div className="chat-header-status">
            {backendOnline ? "Agent Online" : "Agent Offline"}
          </div>
        </header>

        {hasMessages ? (
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            metadata={metadata}
            messagesEndRef={messagesEndRef}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <>
            <WelcomeScreen onSuggestion={handleSuggestion} />
            <div className="chat-input-container">
              <ChatInput
                onSend={handleSendMessage}
                disabled={isLoading || !backendOnline}
              />
            </div>
          </>
        )}

        {showHITL && (
          <HITLModal
            message={hitlMessage}
            onApprove={() => handleHITLResponse(true)}
            onDecline={() => handleHITLResponse(false)}
          />
        )}
      </main>
    </div>
  );
}

/* ── Inline ChatInput (reused in welcome and chat views) ──────────────── */

function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="chat-input-wrapper">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder="Describe your IT issue..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          id="chat-input"
          autoComplete="off"
        />
        <button
          className="chat-send-btn"
          type="submit"
          disabled={disabled || !value.trim()}
          id="send-btn"
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
      <p className="chat-input-hint">
        Press Enter to send · Describe your issue in detail for best results
      </p>
    </form>
  );
}

export { ChatInput };
