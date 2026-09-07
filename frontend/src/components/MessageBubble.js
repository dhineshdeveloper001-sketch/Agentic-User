"use client";

/**
 * Renders a single chat message bubble (user or assistant).
 * Converts basic markdown-like patterns to styled HTML.
 */
export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const time = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={`message ${isUser ? "message-user" : "message-assistant"}`}>
      <div className="message-avatar">
        {isUser ? "👤" : "🤖"}
      </div>
      <div>
        <div
          className="message-content"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
        />
        {time && <div className="message-timestamp">{time}</div>}
      </div>
    </div>
  );
}

/**
 * Basic markdown → HTML converter for chat messages.
 * Handles: bold, italic, code, headers, lists, line breaks, links.
 */
function formatMarkdown(text) {
  if (!text) return "";

  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

    // Headers (## and ###)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")

    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")

    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")

    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")

    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")

    // Line breaks (double newline = paragraph, single = br)
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  // Wrap list items
  html = html.replace(
    /(<li>.*?<\/li>)+/gs,
    (match) => `<ul>${match}</ul>`
  );

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[23]>)/g, "$1");
  html = html.replace(/(<\/h[23]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)<\/p>/g, "$1");

  return html;
}
