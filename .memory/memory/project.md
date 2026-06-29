# TOSS — eFootball Tournament Platform

Telegram Mini App for competitive eFootball tournaments with P2P wagering, OCR result verification, and M-Pesa payments.

## Architecture
- **Frontend**: `/root/turf-war-pro` (TanStack Router, React 18, Tailwind v4) — port 3001
- **Backend**: `/root/Efootball-tournament-app/server` (Express + TypeScript) — port 3002
- **Database**: sql.js (SQLite in-memory) at `data/efootball.db`
- **Payments**: Paynecta (M-Pesa STK Push)

## Core Features
- Tournament creation (knockout/league brackets)
- Match result submission with screenshot OCR verification
- P2P wager system (code-first: create → share code → accept)
- Subscription tiers for organizers
- Admin dashboard with role-based access
