# 🧪 Sandboxes – Sichere Code-Ausführung (Claude Code / Emergent Pattern)

## Prinzip
User-Code läuft NIEMALS im Main-Process. Isolation-Layer:

## Option A: Docker-Micro-Sandbox (Self-Hosted)
docker run --rm --network=none --memory=128m --cpus=0.5 \
  --read-only --user=nobody --pids-limit=50 \
  -v /tmp/job:/work:ro executor-image timeout 10s node /work/code.js

## Option B: E2B / Firecracker microVM (Empfohlen für Vercel-Setup)
- E2B SDK: Sandbox.create() → filesystem.write() → process.start()
- Timeout: 30s hard limit, Output-Streaming zurück ans Frontend

## Sicherheitsregeln
1. Kein Netzwerkzugriff in Sandbox (--network=none)
2. Memory/CPU/PID-Limits gesetzt
3. Read-only Filesystem
4. Kein Zugriff auf Env-Vars / Secrets
5. Output-Größe capped (1MB)
6. Code-Scan vor Ausführung: require('fs'), child_process, eval() → block

## API
POST /api/sandbox/execute { code, language, session_id }
- Auth required, Usage-Limits via Stripe-Plan
- Response: { stdout, stderr, exit_code, duration_ms }

## UI-Einbindung
"Run"-Button im CodeBlock → POST → Streaming Output-Panel mit
Emergent-Style Terminal-Animation (Zeilen erscheinen staggered)
