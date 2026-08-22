---
# 🔧 CONFIG-BLOCK — INDIVIDUELL ANPASSBAR
config:
  debug:
    level: "verbose"              # "silent" | "errors" | "verbose"
    log_target: "neon:debug_logs" # Tabelle in Neon, alternativ "file"
    realtime_overlay: true        # In-App Debug-Panel (Dev-Mode)
  auto_fix:
    enabled: true
    max_retries: 3
    safe_mode_on_repeated_fail: true   # Sandbox/Endpoint sperren
  security:
    block_threshold: 3            # verdächtige Events → IP/ User-Block
    alert_webhook: ""             # ← Discord/Slack-Webhook eintragen
    pentest_gate: 90              # % aus PENTEST.md; darunter Deploy-Block
  sandbox:
    test_file_ref: "#sandbox-tests"    # Sektion unten in dieser Datei
    blocked_patterns:             # ← erweiterbar
      - "require\\(['\"]fs"
      - "child_process"
      - "eval\\("
      - "process\\.env"
      - "fetch\\(|http\\.request"      # Netzwerk in Sandbox = verboten
  links:
    backend: "BACKEND.md"
    auth: "AUTH-LOGIN.md"
    pentest: "PENTEST.md"
    sandbox: "SANDBOXES.md"
---

# 🐞🛡️ DEBUG + SECURITY – Auto-Fix & Guard-Layer

## 1. Architektur (Verknüpfungs-Graph)
Jede Datei sendet Events ──▶ sec_events (Neon, service-role only)
                                 │
                    ┌────────────┼─────────────┐
              Watcher-Loop   Auto-Fixer    Pentest-Gate
              (config.debug) (config.auto_fix) (PENTEST.md Score)
                    │            │              │
              Dev-Overlay   Retry/Patch    Deploy blockieren
              (Emergent-    /Safe-Mode     < config.pentest_gate
               Animation)

## 2. sec_events Schema (Neon)
CREATE TABLE sec_events (
  id uuid pk default gen_random_uuid(),
  user_id uuid, ip inet,
  category text check (category in
    ('auth_fail','rls_violation','sbx_escape','injection','rate_abuse','bug')),
  severity smallint,            -- 1 info … 5 critical
  payload jsonb, fixed boolean default false,
  created_at timestamptz default now()
);
ALTER TABLE sec_events ENABLE ROW LEVEL SECURITY;
-- KEINE Policy für Users → nur service-role (Edge Functions) schreibt/liest!

## 3. Watcher-Regeln (severity → Aktion)
auth_fail ≥ 3 von gleicher IP/15min     → Block + Alert (AUTH-LOGIN.md Lockout)
rls_violation (401/403 auf fremde UUID) → sofort severity 4, Alert-Webhook
injection (Pattern-Match auf Inputs)    → Request droppen, severity 4
sbx_escape (Pattern aus config.sandbox) → Sandbox-Job killen, severity 5,
                                          User-Sandbox in Safe-Mode
rate_abuse                              → throttle → block

if (severity >= config.block_threshold_trigger) {
  await blockIP(ip); await notify(config.alert_webhook);
}

## 4. Auto-Fixer
onError(err, ctx):
  1. Klassifizieren: known_pattern? → applyPatch(ctx)
  2. Retry bis max_retries mit Backoff
  3. Scheitert → safe_mode: Endpoint/Sandbox für User sperren,
     Bug-Ticket in debug_logs, Frontend zeigt freundlichen Fallback
- Stack-Traces NIE an Client (nur error_id → Lookup serverseitig)

## 5. Dev-Overlay (Vibe/Debug-UI, anbindbar an CHATHUB.md)
- Toggle: STRG+SHIFT+D (nur env.NODE_ENV=development)
- Panel: Live-Event-Stream, latency, RLS-Query-Log, Retry-Status
- Animation: Emergent-Style pulsierender Status-Orb
  (grün ok / gelb retry / rot safe_mode)

## 6. SANDBOX-TESTS (prüft SANDBOXES.md, läuft VOR jeder Execution)
// Pre-Flight: jeder User-Code durchläuft scan() vor Sandbox-Start
export function scan(code) {
  for (const p of config.sandbox.blocked_patterns)
    if (new RegExp(p).test(code))
      throw new SandboxBlock(`Pattern: ${p}`);  // → sec_event 'sbx_escape'
}

// Laufzeit-Tests (CI + Pre-Deploy, referenziert PENTEST.md#sandbox-hardening)
describe('Sandbox Execution Gate', () => {
  test('Erlaubter Code läuft, Output gestreamt', async () => {
    const r = await exec(`console.log(2+2)`);
    expect(r.stdout).toBe('4\n');
    expect(r.duration_ms).toBeLessThan(30000);
  });
  test.each(config.sandbox.blocked_patterns)
    ('Pattern %s → blocked + sec_event', async (p) => { ... });
  test('Limits: RAM<128m, CPU<0.5, kein Netz, read-only FS', ...);
  test('1MB Output-Cap greift', ...);
});

## 7. Deploy-Gate (Hand-in-Hand mit PENTEST.md)
- CI: pentest_score = passed/total*100
- score < config.pentest_gate → Vercel-Deploy geblockt, Report als Artifact
- Zusätzlich: letzte 24h sec_events severity≥4 → Deploy-Warnung
