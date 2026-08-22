# 💬 ChatHub – Frontend & Chat Core
> Vibe-Coding UI im Claude/Lovable-Stil mit Emergent-Animationen

## Stack
React 18 + Vite + TailwindCSS + Framer Motion + SSE Streaming

## Komponenten-Architektur
- <ChatContainer/> – Auto-Scroll, Message-Queue
- <StreamingBubble/> – Token-weise Animation (Typing-Effect)
- <AgentThinking/> – Emergent-Style Loading (pulsende Orbs, Tool-Steps)
- <CodeBlock/> – Syntax-Highlight + Copy + "Run in Sandbox" Button
- <Sidebar/> – Sessions aus Neon DB (RLS-gefiltert)

## Streaming-Logik
const stream = new EventSource(`/api/chat/stream?session=${id}`);
- Tokens appenden → React state
- tool_call Events → AgentThinking UI
- citations/artifacts → Artefakt-Panel rechts (Lovable-Pattern)

## UI-Vibe Specs
- Dark Mode default, Glassmorphism Cards (backdrop-blur)
- Framer Motion: spring-Animationen, staggered Message-Entrance
- Gradient-Borders bei aktivem Agent-Status
- Micro-Animations: Button-Hover scale 1.02, Send-Button → Morpht zu Loading-Dots

## API-Anbindung
- POST /api/chat → Backend (auth-header JWT)
- GET /api/sessions → RLS: nur eigene
- Stripe-Gate: useUsage() Hook prüft Credits vor Send
