"use client";

/**
 * Displays a created support ticket with all details.
 */
export default function TicketCard({ ticket }) {
  if (!ticket) return null;

  return (
    <div className="ticket-card" id="ticket-card">
      <div className="ticket-card-header">
        <span style={{ fontSize: "18px" }}>📋</span>
        <h4>Support Ticket Created</h4>
      </div>

      <div className="ticket-details">
        <div className="ticket-field">
          <span className="ticket-field-label">Ticket ID</span>
          <span className="ticket-field-value">{ticket.ticket_id || "N/A"}</span>
        </div>
        <div className="ticket-field">
          <span className="ticket-field-label">Priority</span>
          <span
            className="ticket-field-value"
            style={{
              color:
                ticket.priority === "P1"
                  ? "var(--status-error)"
                  : ticket.priority === "P2"
                  ? "var(--status-warning)"
                  : "var(--status-info)",
            }}
          >
            {ticket.priority || "P3"}
          </span>
        </div>
        <div className="ticket-field">
          <span className="ticket-field-label">Assigned Team</span>
          <span className="ticket-field-value">
            {ticket.assigned_team || "IT Support"}
          </span>
        </div>
        <div className="ticket-field">
          <span className="ticket-field-label">Expected Response</span>
          <span className="ticket-field-value">
            {ticket.estimated_response || "TBD"}
          </span>
        </div>
      </div>
    </div>
  );
}
