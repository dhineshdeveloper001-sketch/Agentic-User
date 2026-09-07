"use client";

export default function WelcomeScreen({ onSuggestion }) {
  const suggestions = [
    {
      icon: "🔒",
      title: "VPN Not Connecting",
      description: "Cisco AnyConnect timeout or connection failures",
      prompt: "My VPN is not connecting. I keep getting a timeout error when trying to connect with Cisco AnyConnect.",
    },
    {
      icon: "📧",
      title: "Email Not Syncing",
      description: "Outlook disconnected or emails stuck",
      prompt: "My Outlook is showing 'Disconnected' and I'm not receiving any new emails since this morning.",
    },
    {
      icon: "🔑",
      title: "Account Locked Out",
      description: "Too many failed login attempts",
      prompt: "I'm locked out of my account. I keep getting 'The referenced account is currently locked out' when trying to log in.",
    },
    {
      icon: "🖨️",
      title: "Printer Not Working",
      description: "Network printer offline or stuck queue",
      prompt: "My printer shows as offline and all my print jobs are stuck in the queue. The printer is on the 3rd floor.",
    },
  ];

  return (
    <div className="welcome-screen">
      <div className="welcome-icon">🛡️</div>
      <h2>How can I help you today?</h2>
      <p>
        I&apos;m your AI-powered IT support agent. I can diagnose issues,
        run system checks, walk you through fixes step-by-step,
        and escalate to specialists when needed.
      </p>

      <div className="welcome-suggestions">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="suggestion-card"
            onClick={() => onSuggestion(s.prompt)}
            id={`suggestion-${i}`}
          >
            <div className="suggestion-card-icon">{s.icon}</div>
            <h4>{s.title}</h4>
            <p>{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
