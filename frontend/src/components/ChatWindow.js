"use client";

import { useState, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ToolCard from "./ToolCard";
import StepTracker from "./StepTracker";
import TicketCard from "./TicketCard";

export default function ChatWindow({
  messages,
  isLoading,
  metadata,
  messagesEndRef,
  onSendMessage,
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  return (
    <>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i}>
            <MessageBubble message={msg} />

            {/* Show tool cards after assistant messages with diagnostic results */}
            {msg.role === "assistant" &&
              msg.metadata?.diagnostic_results?.length > 0 && (
                <div
                  style={{ maxWidth: "85%", marginTop: "-8px" }}
                  className="message-assistant"
                >
                  <div style={{ marginLeft: "48px" }}>
                    <ToolCard results={msg.metadata.diagnostic_results} />
                  </div>
                </div>
              )}

            {/* Show step tracker when an SOP is active */}
            {msg.role === "assistant" &&
              msg.metadata?.has_sop &&
              msg.metadata?.total_steps > 0 &&
              i === messages.length - 1 && (
                <div
                  style={{ maxWidth: "85%", marginTop: "-8px" }}
                  className="message-assistant"
                >
                  <div style={{ marginLeft: "48px" }}>
                    <StepTracker
                      currentStep={msg.metadata.current_step}
                      totalSteps={msg.metadata.total_steps}
                      sopTitle={msg.metadata.sop_title}
                    />
                  </div>
                </div>
              )}

            {/* Show ticket card when a ticket is created */}
            {msg.role === "assistant" && msg.metadata?.ticket_info && (
              <div
                style={{ maxWidth: "85%", marginTop: "-8px" }}
                className="message-assistant"
              >
                <div style={{ marginLeft: "48px" }}>
                  <TicketCard ticket={msg.metadata.ticket_info} />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="typing-indicator">
            <div
              className="message-avatar"
              style={{ background: "var(--gradient-agent)" }}
            >
              🤖
            </div>
            <div className="typing-dots">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-container">
        <form onSubmit={handleSubmit}>
          <div className="chat-input-wrapper">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              placeholder="Type your response or describe a new issue..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              id="chat-input-active"
              autoComplete="off"
              autoFocus
            />
            <button
              className="chat-send-btn"
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              id="send-btn-active"
              aria-label="Send message"
            >
              ➤
            </button>
          </div>
          <p className="chat-input-hint">
            Press Enter to send · Be specific about error messages for faster resolution
          </p>
        </form>
      </div>
    </>
  );
}
