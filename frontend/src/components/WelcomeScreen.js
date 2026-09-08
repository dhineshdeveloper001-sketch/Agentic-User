"use client";

export default function WelcomeScreen({ onSuggestion }) {
  const suggestions = [
    {
      icon: "🌐",
      title: "Network Issue",
      description: "WiFi is connected but no internet access",
      prompt: "My WiFi is connected but I have no internet.",
    },
    {
      icon: "💻",
      title: "Slow Computer",
      description: "Performance lag, system freezing or high memory",
      prompt: "My computer is running very slowly.",
    },
    {
      icon: "🖨️",
      title: "Printer Problem",
      description: "Network printer offline or stuck queue",
      prompt: "My printer is not printing.",
    },
    {
      icon: "🌍",
      title: "Browser Issue",
      description: "Browser crashes, SSL certificate or cache errors",
      prompt: "Chrome keeps crashing.",
    },
    {
      icon: "🔐",
      title: "VPN Problem",
      description: "Cisco AnyConnect gateway connection failures",
      prompt: "My VPN is not connecting.",
    },
    {
      icon: "🔊",
      title: "Audio Problem",
      description: "Missing audio output device or muted driver",
      prompt: "My computer has no sound.",
    },
  ];

  const categories = [
    { label: "Network", icon: "🌐", prompt: "My WiFi is connected but there is no internet." },
    { label: "System", icon: "💻", prompt: "My computer is very slow." },
    { label: "Printer", icon: "🖨️", prompt: "My printer is offline." },
    { label: "Browser", icon: "🌍", prompt: "Chrome keeps crashing." },
    { label: "VPN", icon: "🔐", prompt: "My VPN is not connecting." },
    { label: "Audio", icon: "🔊", prompt: "My computer has no sound." },
    { label: "Software", icon: "📦", prompt: "An application is not opening." },
    { label: "Performance", icon: "⚡", prompt: "My laptop performance is very slow." },
  ];

  return (
    <div className="welcome-screen">
      <div className="welcome-badge">AI-Powered IT Support</div>
      <div className="welcome-icon-wrap">🛡️</div>
      <h2>How can I help you today?</h2>
      <p className="welcome-desc">
        I&apos;m your intelligent technical helpdesk agent. I can diagnose infrastructure issues,
        run system checks, walk you through fixes step-by-step, and escalate to specialists when needed.
      </p>

      <div className="welcome-suggestions-grid">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            className="suggestion-card"
            onClick={() => onSuggestion(s.prompt)}
            id={`suggestion-${i}`}
          >
            <div className="suggestion-icon">{s.icon}</div>
            <div className="suggestion-content">
              <h4>{s.title}</h4>
              <p>{s.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="category-pills-container" style={{ marginTop: "24px", border: "none" }}>
        <span className="category-label">Quick Issues:</span>
        <div className="category-pills-scroll">
          {categories.map((c, i) => (
            <button
              key={i}
              type="button"
              className="category-pill"
              onClick={() => onSuggestion(c.prompt)}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
