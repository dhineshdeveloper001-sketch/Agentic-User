"use client";

/**
 * Human-in-the-Loop approval modal.
 * Shown when the agent needs explicit user approval for
 * security-sensitive actions like password resets.
 */
export default function HITLModal({ message, onApprove, onDecline }) {
  return (
    <div className="hitl-overlay" id="hitl-modal">
      <div className="hitl-modal">
        <div className="hitl-modal-icon">⚠️</div>
        <h3>Action Requires Your Approval</h3>
        <p>
          The agent wants to perform a security-sensitive action.
          Please review and confirm before proceeding.
        </p>
        <div className="hitl-actions">
          <button
            className="hitl-btn hitl-btn-decline"
            onClick={onDecline}
            id="hitl-decline-btn"
          >
            Decline & Escalate
          </button>
          <button
            className="hitl-btn hitl-btn-approve"
            onClick={onApprove}
            id="hitl-approve-btn"
          >
            ✓ Approve Action
          </button>
        </div>
      </div>
    </div>
  );
}
