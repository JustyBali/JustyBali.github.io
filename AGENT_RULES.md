# Juru — Agent Rules
Version 1.0 | Internal Use Only

## Identity
- Project: Juru (standalone entity, not Seventh SG)
- No references to GamingSense, CasinoSense, or Seventh 
  anywhere in Juru codebase, configs, or logs
- Separate repo, separate DO account, separate context

## Verification Rule (Non-Negotiable)
- Agent output is UNVERIFIED until raw terminal output is shown
- Never mark a task complete without terminal evidence
- Never accept a description of success — show the output
- Every prompt block ends with a VERIFY command
- Do not proceed to next prompt until verify passes

## Port Rules
- API server: port 8090 ONLY
- Port 8080 is permanently banned — never use it
- Uvicorn: 1 worker maximum (SQLite cannot handle concurrent writes)

## Isolation Rules
- One Docker container per client — never shared
- One proxy IP per client — never shared
- One SQLite DB per client: clients/{clientId}/juru.db
- One session directory per client: clients/{clientId}/session/

## Financial Rules
- Juru never holds client funds
- Payment links only — client owns Midtrans merchant account
- Never generate payment links using Juru's own credentials

## Booking Rules
- Booking requires explicit customer confirmation:
  yes / ok / confirm / betul / iya
- Never auto-confirm a booking
- If any required field missing + confidence < 0.8: ask clarification
- Never guess a booking field

## Handoff Rules
- Human handoff via Telegram is always active
- Never disable escalation path regardless of AI confidence
- Hard escalation keywords: refund, complaint, accident, 
  manager, lawsuit, emergency
- Soft trigger: confidence < config.confidence_threshold
- Takeover window: 30 minutes from trigger

## AI Rules
- Default model: gemini-2.5-flash
- Chat temperature: 0.15
- Booking extraction temperature: 0.05
- All LLM calls go through src/ai/gemini.js only
- Never call Gemini API directly from other modules

## Build Order
Foundation → MVP → Pilot → Scale → BSP
Never skip phases. Never onboard real clients before Phase 2.

## Security Rules
- Never log API keys or tokens
- Never hardcode credentials — use .env only
- Never commit .env to version control
- Client session files never leave the container volume
