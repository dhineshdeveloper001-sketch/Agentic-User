"use client";

/**
 * Displays the progress of multi-step SOP resolution.
 * Shows a progress bar and step list with completion status.
 */
export default function StepTracker({ currentStep = 0, totalSteps = 0, sopTitle = "" }) {
  if (totalSteps === 0) return null;

  const progress = Math.min(((currentStep + 1) / totalSteps) * 100, 100);

  return (
    <div className="step-tracker" id="step-tracker">
      <div className="step-tracker-header">
        <span className="step-tracker-title">📋 Resolution Progress</span>
        <span className="step-tracker-progress">
          Step {Math.min(currentStep + 1, totalSteps)} of {totalSteps}
        </span>
      </div>

      <div className="step-progress-bar">
        <div
          className="step-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="step-list">
        {Array.from({ length: totalSteps }, (_, i) => {
          let status = "pending";
          if (i < currentStep) status = "completed";
          else if (i === currentStep) status = "active";

          return (
            <div key={i} className={`step-item ${status}`}>
              <div className="step-dot" />
              <span>
                Step {i + 1}
                {status === "completed" && " — Done"}
                {status === "active" && " — In Progress"}
              </span>
            </div>
          );
        })}
      </div>

      {sopTitle && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "11px",
            color: "var(--text-tertiary)",
          }}
        >
          Procedure: {sopTitle}
        </div>
      )}
    </div>
  );
}
