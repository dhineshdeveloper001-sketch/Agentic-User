"use client";

import { useState } from "react";

export default function SourcesCard({ sources = [] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className={`sources-card ${isOpen ? "open" : ""}`}>
      <div className="sources-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="sources-header-left">
          <span>📚</span>
          <span>Referenced Knowledge Sources ({sources.length})</span>
        </div>
        <span className="sources-toggle-icon">{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div className="sources-list" style={{ display: "flex" }}>
          {sources.map((s, i) => (
            <div key={i} className="source-item">
              <div className="source-item-title">
                <span>{s.title || "SOP Runbook"}</span>
                {s.score && (
                  <span className="source-item-score">
                    {Math.round(s.score * 100)}% match
                  </span>
                )}
              </div>
              {s.snippet && (
                <div className="source-item-snippet">{s.snippet}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
