# ⚙️ Backend – Neon Postgres + Auth + RLS + Stripe + NVIDIA

## Schema (Neon Postgres)
users(id uuid pk, email unique clusters, stripe_customer_id, plan, created_at)
sessions(id, user_id fk, title, created_at)
messages(id, session_id fk, role, content, tokens_used, created_at)
usage_log(id, user_id fk, tokens, cost, ts)

## RLS Policies (KRITISCH)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sessions ON sessions
  USING (user_id = auth.uid());
CREATE POLICY own_messages ON messages
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
-- Service-Role BYPASS nur für Edge Functions, nie im Client

## API Endpunkte (Vercel Edge / Serverless)
POST /api/auth/register  → argon2 hash, JWT issue (15min + refresh 7d)
POST /api/auth/login     → rate-limit 5/min/IP
POST /api/chat/stream    → NVIDIA NIM call, SSE-Proxy, Token-Counting → usage_log
POST /api/stripe/webhook → Signature-Verify, plan update
GET  /api/usage          → RLS-gefiltert

## NVIDIA Integration
fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  headers: { Authorization: `Bearer ${env.NVIDIA_KEY}` },
  body: { model: 'meta/llama-3.1-70b-instruct', stream: true }
})
→ Server-seitig proxien, Key NIEMALS im Client

## Security-Baselines
- Alle Inputs: zod-Validation
- Parameterized Queries only (kein String-Concat!)
- CORS: nur eigene Domain
- Helmet-Headers, CSP
