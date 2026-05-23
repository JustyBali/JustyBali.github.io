# Juru Changelog

## Phase 0 — Foundation
**Date:** 2026-05-23
**Status:** Complete

### Built
- Workspace scaffold: full directory structure, npm init,
  all Node and Python dependencies installed
- `src/whatsapp/session.js`: Baileys session manager,
  QR scan, session persistence, auto-reconnect on 
  connectionClosed, loggedOut stops cleanly,
  group message filter (@g.us ignored)
- `src/whatsapp/jitter.js`: human pacing layer,
  800-2000ms read delay, composing indicator,
  4.5 chars/sec typing with 30% variance,
  8000ms cap, chunking for responses >200 chars
- `src/ai/gemini.js`: Gemini 2.5 Flash pipeline,
  system prompt injection (persona, FAQ, datetime,
  timezone, escalation keywords, language),
  temperature 0.15, returns {text, confidence, shouldEscalate},
  Bahasa language detection heuristic
- `src/db/faq.js`: SQLite FAQ store, CRUD operations,
  LIKE-based search returning top 5 formatted matches
- `src/ai/handoff.js`: Telegram handoff trigger,
  low confidence + keyword escalation,
  inline keyboard (Send AI / Take Over / Ignore),
  isTakeover() with 30min window,
  null sock handled gracefully
- `src/proxy/pool.js`: HttpsProxyAgent per client,
  markProxyBanned(), rotateProxy() with timestamp session
- `src/booking/extractor.js`: Gemini 2.5 Flash at temp 0.05,
  extracts service/date/time/party_size/deposit/confidence,
  clarification_needed if fields missing,
  responseMimeType application/json
- `src/booking/calendar.js`: SQLite bookings table,
  createEvent(), getAvailability() with conflict detection
  and +1hr/+2hr alternatives, confirmBooking()
- `docker/Dockerfile`: node:20-slim, build tools for
  better-sqlite3 native compile, production npm ci
- `docker/docker-compose.yml`: per-client template,
  juru_net bridge, isolated volumes, restart unless-stopped
- `scripts/onboard.sh`: client directory setup,
  config + env copy, docker-compose launch
- `templates/config.yaml`: Rumah Bali Spa reference config
- `.env`: API keys structure (Gemini, Telegram, Proxy)
- `.dockerignore`: node_modules, sessions, .env excluded

### Verified
- QR code renders in terminal within 5 seconds
- Gemini pipeline returns {text, confidence, shouldEscalate}
- Docker build 11/11 finished, juru_test image live
- HttpsProxyAgent instantiates, ban/rotate cycle logs correctly
- Handoff triggers on low confidence, isTakeover returns boolean
- Booking extraction: all fields populated, confidence 1.0
- Conflict detection returns alternatives [16:00, 17:00]

### Pending (blocked)
- End-to-end message flow: needs dedicated SIM
- Telegram alerts: needs real bot token + TELEGRAM_CHAT_ID
- Dedicated Gemini API key for Juru (currently shared with CasinoSense)

### Known Issues
- clientId shows as 'default' in handoff log — resolves when
  container runs with correct CLIENT_ID env var
- Telegram 401 Unauthorized — placeholder token in .env

---

## Phase 1 — MVP (Partial)
**Date:** 2026-05-23
**Status:** In Progress — blocked on SIM, credentials, DO

### Built
- `api/server.py`: FastAPI on port 8090, X-API-Key auth,
  full FAQ CRUD, conversations endpoint, stats endpoint,
  config update endpoint, /health unauthenticated
- `src/db/conversations.js`: conversations table in SQLite,
  logConversation(), getConversations(), getStats(),
  initConversations()
- `src/utils/lang.js`: language detection (id/en/ru/zh/fr),
  CJK regex, Cyrillic regex, Bahasa word-count (>=2),
  French word-count (>=2), English fallback,
  getLanguageInstruction() for Gemini system prompt
- `src/utils/config.js`: loadConfig(), saveConfig()
  with field whitelist (confidence_threshold, working_hours)
- `src/utils/hours.js`: isWithinHours() timezone-aware,
  getOutOfHoursMessage() formatted response
- Updated `src/ai/gemini.js`: language detection integrated,
  language field added to return object
- Updated `src/index.js`: loadConfig(), isWithinHours guard,
  OUT_OF_HOURS logging, language passed to logConversation,
  history map capped at 10 exchanges per JID

### Verified
- Language detection: id/en/fr/zh/ru all correct
- Gemini returns language:'id' on Bahasa input
- isWithinHours timezone-aware, OOH message correct
- FastAPI health, FAQ POST, auth all confirmed
- Conversation logging: today_volume >= 1 confirmed

### Pending
- Google Calendar API integration
- Stripe billing setup
- Partner portal dashboard
- End-to-end live message test (blocked: SIM)
- DO SGP1 deployment (blocked: credentials)

---

## Phase 1 — MVP
**Status:** Not started
**Target:** Docker multi-tenant, 5 client capacity, 
            proxy pool live, DO SGP1 deploy
