---
# 🔧 CONFIG-BLOCK — HIER INDIVIDUELL ANPASSEN
config:
  branding:
    app_name: "DeinAppName"            # ← ändern
    logo_url: "/logo.svg"
    primary_color: "#8B5CF6"           # Vibe-Purple, frei wählbar
    gradient: ["#8B5CF6", "#06B6D4"]   # Login-Screen Gradient
    animation_style: "emergent"        # "emergent" | "minimal" | "lovable"
  auth:
    providers: ["email"]               # + "github", "google" aktivierbar
    jwt_access_ttl: "15m"
    jwt_refresh_ttl: "7d"
    hash_algo: "argon2id"              # alternativ "bcrypt" (cost 12)
    max_login_attempts: 5
    lockout_duration: "15m"
    require_email_verification: true
  stripe:
    free_credits: 100                  # Credits nach Registrierung
    plans: ["free", "pro", "team"]
  links:                               # ← Verknüpfung zu anderen Dateien
    backend_file: "BACKEND.md"
    chathub_file: "CHATHUB.md"
    debug_hooks: "DEBUG-SECURITY.md#auth-watch"
---

# 🔐 AUTH-LOGIN – Hand-in-Hand mit BACKEND.md & NEON RLS

## 1. Flow-Übersicht (Verknüpfungs-Graph)
Login UI ──POST /api/auth/login──▶ BACKEND.md#auth
   ◀── JWT { access, refresh } ── argon2id Verify
   │
   ├──▶ JWT → jeder ChatHub-Request (CHATHUB.md#api-anbindung, Header: Authorization)
   ├──▶ JWT → auth.uid() in NEON RLS Policies (BACKEND.md#rls)
   ├──▶ login_event → usage_log + DEBUG-SECURITY.md Watcher
   └──▶ Stripe: customer_id laden → Plan-Gate für Chat/Sandbox

## 2. Login-UI (React, Vibe-Coding Style)
// Komponente: <AuthScreen/> — anpassbar über config.branding
- Glassmorphism-Card, Gradient-Border aus config.gradient
- Framer Motion:
  entrance: { opacity: 0, y: 24 } → staggered Felder
  Button: onSubmit → morpht zu Emergent-Loading-Dots
  Fehler: shake-Animation + roter Glow
  Success: Checkmark-Morph → Redirect-Transition zu ChatHub
- Passwort-Feld: Stärke-Meter (zxcvbn), Show/Hide-Toggle
- OAuth-Buttons nur rendern wenn in config.auth.providers

const handleLogin = async (email, password) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) // zod-validated clientseitig
  });
  if (res.status === 429) return showLockout(config.lockout_duration);
  const { access, refresh, user } = await res.json();
  tokenStore.set(access, refresh);        // httpOnly Cookie bevorzugt!
  trackUsage('login');                     // → DEBUG-SECURITY Watcher
  router.push('/chat');
};

## 3. Backend-Verknüpfung (BACKEND.md Endpunkte)
POST /api/auth/register
  → argon2id(password)
  → INSERT users (Neon) → Stripe customer.create() → user.stripe_customer_id
  → free_credits gutschreiben (config.stripe.free_credits)
  → Verification-Mail wenn require_email_verification

POST /api/auth/login
  → Rate-Limit: max_login_attempts/IP+Email (Redis/Upstash)
  → argon2.verify(stored_hash, password)
  → Bei Fail: login_attempts++, bei 5 → Lockout, Event an DEBUG-SECURITY
  → Bei OK: JWT sign (HS256/RS256, env.JWT_SECRET), refresh rotation

POST /api/auth/refresh  → rotiert, altes Token blacklisten
POST /api/auth/logout   → Refresh invalidieren

## 4. RLS-Verknüpfung (KRITISCH)
-- Neon: JWT Claims in Session setzen (Edge Function Middleware)
SELECT set_config('request.jwt.claims', $jwt, true);
-- auth.uid() Funktion liest sub-Claim → alle Policies aus BACKEND.md
-- greifen NUR mit gültigem Token. Ohne Login = anon = 0 Rows.

## 5. Stripe-Verknüpfung
- Nach Login: GET /api/usage → Credits ≥ 1? Sonst <PaywallModal/>
- Plan-Upgrade → Checkout-Session → Webhook updated users.plan
- useAuth() Hook exponiert: { user, plan, credits, isLocked }

## 6. Security-Gates (greifen in DEBUG-SECURITY.md rein)
- Kein Login ohne Rate-Limit-Check
- Kein Token im localStorage (XSS!) → httpOnly + SameSite=strict
- CSRF-Token bei Cookie-Auth
- Alle Auth-Events → sec_events Tabelle (wird von Datei 6 überwacht)
