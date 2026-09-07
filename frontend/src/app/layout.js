import "./globals.css";

export const metadata = {
  title: "IT Support Agent — Intelligent Helpdesk",
  description:
    "AI-powered IT support agent with diagnostic tools, knowledge base, and automated escalation. Get instant help for VPN, email, password, printer, and software issues.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
