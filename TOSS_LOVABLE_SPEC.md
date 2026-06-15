# TOSS — eFootball Tournament Platform
## Full Application Specification for Lovable

---

## 1. Project Overview

**TOSS** (Tournament Organizer & Scoring System) is a competitive eFootball tournament platform where players create and join tournaments, submit match results with screenshot verification via OCR, and track standings in real-time. The platform includes a wager/betting system with M-Pesa payment integration via Paynecta.

**Live URL:** https://xtournament.duckdns.org

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite 5 + Tailwind CSS v4 |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | sql.js (SQLite in-memory, persisted to file) |
| **Real-time** | Socket.IO |
| **Auth** | JWT (Bearer tokens) + Telegram OAuth |
| **Payments** | Paynecta API (STK Push / M-Pesa) |
| **File Upload** | Multer (memory storage) |
| **OCR** | Tesseract.js for screenshot score extraction |
| **Routing** | React Router v6 |
| **Animations** | Framer Motion |
| **Deployment** | Single Express server serving SPA static files |

---

## 3. Project Structure

```
/root/Efootball-tournament-app/
├── .env                          # Environment variables
├── package.json                  # Root workspace
├── client/                       # React SPA
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx              # Entry point
│       ├── App.tsx               # Router + auth gate
│       ├── index.css             # Tailwind v4 + custom CSS variables
│       ├── animations.css        # Keyframe animations
│       ├── constants.ts          # App constants
│       ├── api/
│       │   ├── index.ts          # All API client methods (fetch wrapper)
│       │   ├── socket.ts         # Socket.IO client
│       │   └── telegram.ts       # Telegram WebApp SDK
│       ├── components/
│       │   ├── Icons.tsx         # SVG icon components
│       │   ├── layout/
│       │   │   └── Layout.tsx    # Sidenav + Topbar + page wrapper
│       │   ├── ocr/
│       │   │   └── OCRUpload.tsx # Screenshot OCR upload component
│       │   └── ui/
│       │       ├── Badge.tsx
│       │       ├── Button.tsx
│       │       ├── Card.tsx
│       │       ├── Dropdown.tsx
│       │       ├── Input.tsx
│       │       ├── Modal.tsx
│       │       ├── Skeleton.tsx
│       │       └── Toast.tsx
│       ├── context/
│       │   ├── AuthContext.tsx   # Auth state, login/logout, Telegram auto-auth
│       │   └── TelegramContext.tsx
│       ├── hooks/
│       │   ├── useMediaQuery.ts
│       │   └── useToast.ts
│       ├── pages/
│       │   ├── HomePage.tsx          # Landing + featured tournaments
│       │   ├── LoginPage.tsx         # Login form
│       │   ├── RegisterPage.tsx      # Registration form
│       │   ├── TournamentsPage.tsx   # Tournament listing + creation
│       │   ├── TournamentDetailPage.tsx  # Tournament bracket, matches, standings
│       │   ├── ProfilePage.tsx       # User profile, avatar, Telegram link
│       │   └── AdminDashboard.tsx    # Admin panel (users, tournaments, codes, logs)
│       ├── services/
│       │   └── socket.ts             # Socket.IO event handlers
│       └── utils/
│           └── cn.ts                 # Classname utility
├── server/                       # Express API server
│   ├── .env
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Express app setup, middleware, route mounts
│       ├── db.ts                 # sql.js database init + persistence
│       ├── types.ts              # Shared TypeScript types
│       ├── vercel.ts             # Vercel serverless adapter
│       ├── api/
│       │   └── tgApi.ts          # Telegram Bot API client
│       ├── bot/
│       │   └── index.ts          # Telegram bot webhook handler
│       ├── config/
│       │   └── database.ts       # DB config
│       ├── controllers/
│       │   ├── authController.ts
│       │   ├── adminController.ts
│       │   ├── adminCodeController.ts
│       │   ├── deepLinkController.ts
│       │   ├── matchController.ts
│       │   ├── telegramAuthController.ts
│       │   ├── tournamentController.ts
│       │   └── wagerController.ts
│       ├── middleware/
│       │   └── auth.ts           # JWT verify, requireAdmin, requireSuperAdmin
│       ├── routes/
│       │   ├── authRoutes.ts
│       │   ├── tournamentRoutes.ts
│       │   ├── matchRoutes.ts
│       │   ├── adminRoutes.ts
│       │   ├── imageRoutes.ts
│       │   ├── wagerRoutes.ts
│       │   ├── paynectaWebhookRoutes.ts
│       │   └── deepLinkRoutes.ts
│       ├── services/
│       │   ├── bracketService.ts     # Bracket generation logic
│       │   ├── mpesaService.ts       # [DEAD CODE] Old M-Pesa service
│       │   ├── ocrService.ts         # Tesseract OCR processing
│       │   ├── paynectaService.ts    # Paynecta payment API client
│       │   └── socketService.ts      # Socket.IO event broadcasting
│       ├── socket/
│       │   └── index.ts              # Socket.IO connection handler
│       └── utils/
│           ├── sanitize.ts           # Input sanitization
│           └── token.ts              # JWT sign/verify
├── data/
│   └── efootball.db              # SQLite database file (auto-generated)
└── docs/
    ├── IMPLEMENTATION_PLAN.md
    ├── PROJECT_STRUCTURE.json
    └── TASTE_ENGINE.md
```

---

## 4. Database Schema

The database uses **sql.js** (SQLite in-memory with file persistence). All tables are created in `server/src/db.ts`.

### 4.1 Users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  is_admin INTEGER DEFAULT 0,
  is_super_admin INTEGER DEFAULT 0,
  telegram_id TEXT,
  telegram_username TEXT,
  telegram_photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Admin Codes
```sql
CREATE TABLE admin_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  used_by INTEGER,
  used_at DATETIME,
  is_active INTEGER DEFAULT 1,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (used_by) REFERENCES users(id)
);
```

### 4.3 Tournaments
```sql
CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT DEFAULT 'efootball',
  format TEXT NOT NULL,              -- 'knockout' | 'league' | 'multi_bracket' | 'swiss'
  max_players INTEGER NOT NULL,
  best_of INTEGER DEFAULT 1,
  status TEXT DEFAULT 'registration_open',
  owner_id INTEGER NOT NULL,
  winner_id INTEGER,
  prize_pool TEXT,
  registration_deadline DATETIME,
  result_deadline_hours INTEGER DEFAULT 24,
  rules TEXT,
  group_count INTEGER DEFAULT 0,
  bracket_type TEXT DEFAULT 'single',
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.4 Participants
```sql
CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'registered',
  seed INTEGER,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.5 Matches
```sql
CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  player1_id INTEGER,
  player2_id INTEGER,
  player1_score INTEGER,
  player2_score INTEGER,
  winner_id INTEGER,
  status TEXT DEFAULT 'pending',
  confirmation_status TEXT DEFAULT 'pending',
  submitted_by INTEGER,
  submitted_at DATETIME,
  confirmed_at DATETIME,
  screenshot_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.6 Wager Challenges
```sql
CREATE TABLE wager_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  challenger_id INTEGER,
  stake_amount INTEGER NOT NULL,
  commission INTEGER DEFAULT 0,
  total_pot INTEGER NOT NULL,
  match_code TEXT UNIQUE NOT NULL,
  creator_telegram_id TEXT,
  challenger_telegram_id TEXT,
  status TEXT DEFAULT 'awaiting_payment',
  winner_id INTEGER,
  creator_confirmed INTEGER DEFAULT 0,
  challenger_confirmed INTEGER DEFAULT 0,
  creator_winner_choice TEXT,
  challenger_winner_choice TEXT,
  dispute_reason TEXT,
  resolved_by INTEGER,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

### 4.7 Wager Payments
```sql
CREATE TABLE wager_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  payer_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  paynecta_transaction_ref TEXT,
  mpesa_receipt TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (challenge_id) REFERENCES wager_challenges(id),
  FOREIGN KEY (payer_id) REFERENCES users(id)
);
```

### 4.8 Token Blacklist
```sql
CREATE TABLE token_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.9 Admin Logs
```sql
CREATE TABLE admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. API Endpoints

Base URL: `/api`

### 5.1 Auth (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | No | Register new user (username, email, password) |
| POST | `/login` | No | Login, returns JWT + user object |
| POST | `/logout` | Yes | Blacklist current token |
| GET | `/me` | Yes | Get current user profile |
| GET | `/users/:id` | Yes | Get user by ID |
| PUT | `/profile` | Yes | Update profile (firstName, lastName, email) |
| POST | `/redeem-code` | Yes | Redeem admin code for premium access |
| POST | `/forgot-password` | No | Send password reset email |
| POST | `/reset-password` | No | Reset password with token |
| POST | `/telegram-login` | No | Login via Telegram WebApp initData |
| POST | `/link-telegram` | Yes | Link Telegram account to existing user |
| DELETE | `/unlink-telegram` | Yes | Unlink Telegram account |

### 5.2 Tournaments (`/api/tournaments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | List tournaments (?status=&platform=&search=&limit=&offset=) |
| POST | `/` | Yes | Create tournament |
| GET | `/:id` | No | Get tournament details |
| GET | `/:id/participants` | No | Get tournament participants |
| GET | `/:id/standings` | No | Get tournament standings |
| PUT | `/:id` | Yes | Update tournament |
| DELETE | `/:id` | Yes | Delete tournament |
| POST | `/:id/join` | Yes | Join tournament |

### 5.3 Matches (`/api/matches`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tournament/:tournamentId` | No | Get all matches for a tournament |
| GET | `/:id` | No | Get single match details |
| POST | `/ocr` | Yes | Upload screenshot for OCR analysis (multipart) |
| POST | `/ocr/submit` | Yes | Auto-submit result from OCR data |
| POST | `/:id/result` | Yes | Submit match result (scores + optional screenshot) |
| POST | `/:id/confirm` | Yes | Opponent confirms result |
| POST | `/:id/dispute` | Yes | Dispute a submitted result |
| PATCH | `/:id/resolve` | Yes | Admin resolves dispute |

### 5.4 Images (`/api/images`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tournament-images` | No | List available tournament banner images |
| POST | `/upload` | Yes | Upload tournament banner image (multipart) |
| POST | `/avatar` | Yes | Upload user avatar (multipart) |

### 5.5 Admin (`/api/admin`)

All endpoints require admin authentication. Code management requires super admin.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/stats` | Admin | Dashboard statistics |
| GET | `/users` | Admin | List all users |
| PUT | `/users/:id` | Super Admin | Update user (admin status, etc.) |
| DELETE | `/users/:id` | Super Admin | Delete user |
| GET | `/tournaments` | Admin | List all tournaments |
| DELETE | `/tournaments/:id` | Admin | Delete any tournament |
| GET | `/logs` | Admin | View admin action logs |
| GET | `/codes` | Super Admin | List admin codes |
| POST | `/codes/generate` | Super Admin | Generate new admin codes |
| DELETE | `/codes/:id` | Super Admin | Revoke admin code |

### 5.6 Wagers (`/api/wagers`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | List open wager challenges |
| GET | `/by-code/:matchCode` | No | Get wager by match code |
| GET | `/my` | Yes | Get my wagers (created + accepted) |
| GET | `/:id` | No | Get wager details |
| POST | `/` | Yes | Create wager challenge (stakeAmount, phoneNumber) |
| POST | `/:id/accept` | Yes | Accept wager (phoneNumber) |
| POST | `/:id/confirm` | Yes | Confirm winner (creator/challenger) |
| POST | `/:id/dispute` | Yes | Dispute wager result |
| DELETE | `/:id` | Yes | Cancel wager |
| GET | `/admin/stats` | Admin | Wager statistics |
| PUT | `/admin/:id/resolve` | Admin | Resolve wager dispute |

### 5.7 Paynecta Webhook (`/api/paynecta`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhook` | No | Payment confirmation from Paynecta |
| GET | `/health` | No | Webhook health check |

### 5.8 Deep Link (`/api/:slugToken`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/:slugToken` | No | Redirect to tournament/app via deep link |

---

## 6. Frontend Pages & Routing

### 6.1 Router Configuration (App.tsx)

| Path | Component | Auth Required | Layout |
|------|-----------|--------------|--------|
| `/` | HomePage | No | Sidenav + Topbar |
| `/login` | LoginPage | No | Minimal (no sidenav) |
| `/register` | RegisterPage | No | Minimal (no sidenav) |
| `/tournaments` | TournamentsPage | No | Sidenav + Topbar |
| `/tournaments/:id` | TournamentDetailPage | No | Sidenav + Topbar |
| `/profile` | ProfilePage | Yes | Sidenav + Topbar |
| `/admin` | AdminDashboard | Yes (admin) | Sidenav + Topbar |
| `/leaderboard` | (not implemented) | No | Sidenav + Topbar |
| `/about` | (not implemented) | No | Sidenav + Topbar |
| `/privacy` | (not implemented) | No | Sidenav + Topbar |

### 6.2 Layout System

The app uses a **3-panel layout**:
- **Sidenav** (left, collapsible on mobile): Navigation links, logo, admin panel link
- **Topbar** (fixed top): Hamburger menu, search bar, user dropdown/auth buttons
- **Main content** (center): Page content with Framer Motion page transitions

On mobile (< 1024px), the sidenav slides in as an overlay with backdrop.

---

## 7. Authentication Flow

### 7.1 Standard Auth
1. User registers with username/email/password
2. Server returns JWT token + user object
3. Frontend stores token + user in localStorage
4. All authenticated requests include `Authorization: Bearer <token>`
5. Token expires in 7 days (configurable in `.env`)

### 7.2 Telegram Auth
1. User opens Telegram mini app
2. WebApp sends `initData` to `POST /api/auth/telegram-login`
3. Server validates initData with Telegram Bot API
4. If user exists, returns JWT. If not, creates new user
5. Frontend stores token via `telegram-authenticated` custom event

### 7.3 Auth Middleware
- `authenticateToken` — verifies JWT from Authorization header
- `requireAdmin` — checks `user.is_admin === 1`
- `requireSuperAdmin` — checks `user.is_super_admin === 1`

---

## 8. Payment Integration (Paynecta)

### 8.1 Flow
1. User creates a wager with stake amount
2. Server calls `POST /api/wagers` which calls Paynecta STK Push
3. Paynecta sends M-Pesa prompt to user's phone
4. User pays via M-Pesa
5. Paynecta sends webhook to `POST /api/paynecta/webhook`
6. Server verifies payment and updates wager status

### 8.2 Paynecta Service (`server/src/services/paynectaService.ts`)
- `initializePayment(amount, phoneNumber, description)` — Initiates STK Push
- `queryStatus(transactionRef)` — Checks payment status
- `getLinks()` — Gets payment links
- `getBanks()` — Gets supported banks
- `getCurrencyRates()` — Gets exchange rates

### 8.3 Environment Variables
```
PAYNECTA_API_KEY=hmp_eUfqX5RVBb0HHm239no6bdg6d5CcN9fV9LDUOGuU
PAYNECTA_USER_EMAIL=xknight254@gmail.com
PAYNECTA_PAYMENT_LINK_CODE=(not set)
```

---

## 9. OCR Verification System

### 9.1 Flow
1. User uploads match screenshot
2. Server runs Tesseract.js OCR on the image
3. OCR extracts scores using pattern matching
4. If confidence >= 90%, auto-submits result
5. If confidence 55-89%, queues for manual review
6. If confidence < 55%, rejects

### 9.2 Endpoints
- `POST /api/ocr` — Upload screenshot, returns OCR data
- `POST /api/ocr/submit` — Confirm and auto-submit OCR result

---

## 10. Real-time Features (Socket.IO)

### 10.1 Events
- `tournament:updated` — Tournament data changed
- `match:result` — Match result submitted
- `chat:message` — New chat message in tournament

### 10.2 Implementation
- Server: `server/src/services/socketService.ts` + `server/src/socket/index.ts`
- Client: `client/src/api/socket.ts` + `client/src/services/socket.ts`

---

## 11. Design System

### 11.1 Theme
- **Background:** `#0A0A0B` (near-black)
- **Card/Surface:** `#111113` / `#1A1A1E`
- **Accent:** `#F97316` (orange)
- **Text Primary:** `#FFFFFF`
- **Text Secondary:** `#A1A1AA`
- **Border:** `#27272A`
- **Success:** `#22C55E`
- **Error:** `#EF4444`
- **Warning:** `#F59E0B`

### 11.2 Typography
- **Display:** Orbitron (for headings, logo, scores)
- **Body:** Inter (default sans-serif)

### 11.3 CSS Variables (defined in `index.css`)
```css
:root {
  --color-bg: #0A0A0B;
  --color-bg-surface: #111113;
  --color-bg-card: #1A1A1E;
  --color-accent: #F97316;
  --color-accent-hover: #EA580C;
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #A1A1AA;
  --color-text-muted: #71717A;
  --color-border: #27272A;
  --color-border-subtle: #1E1E22;
  --color-success: #22C55E;
  --color-error: #EF4444;
  --color-warning: #F59E0B;
  --navbar-height: 64px;
  --sidenav-width: 240px;
  --content-padding: 24px;
}
```

### 11.4 Component Classes
- `.btn-primary` — Orange gradient button
- `.btn-ghost` — Transparent button with border
- `.input-field` — Dark input with border
- `.card` — Dark card with subtle border
- `.glow-orange` — Orange glow effect

---

## 12. API-to-Frontend Connectivity Status

### 12.1 Connected (working)
All tournament, match, auth, image, and admin endpoints are wired to frontend pages.

### 12.2 Orphaned Backend Endpoints (no frontend caller)

| Endpoint | Issue |
|----------|-------|
| All 11 wager endpoints | Backend + API client exist, but **no wager pages** have been built |
| `GET /api/matches/:id` | No page calls single match |
| `PATCH /api/matches/:id/resolve` | No admin UI for dispute resolution |
| `GET /api/tournaments/:id/standings` | TournamentDetailPage has standings tab but never calls API |
| `PUT /api/tournaments/:id` | No tournament edit page |
| `POST /api/auth/forgot-password` | No forgot password page |
| `POST /api/auth/reset-password` | No reset password page |
| `GET /api/paynecta/health` | Monitoring only, no UI needed |
| `GET /api/:slugToken` | Deep link, no UI needed |

### 12.3 Code Quality Issues
- **AdminDashboard.tsx** uses 7 direct `fetch()` calls instead of the `api.admin.*` methods
- **ProfilePage.tsx** uses 1 direct `fetch()` for profile update instead of `api.auth`
- **server/src/services/mpesaService.ts** is dead code (old M-Pesa integration, not imported anywhere)

---

## 13. Environment Variables

### Server `.env`
```
JWT_SECRET=efootball-arena-super-secret-key-2024
JWT_EXPIRES_IN=7d
PORT=3001
CLIENT_URL=https://xtournament.duckdns.org
TELEGRAM_BOT_TOKEN=8623720245:***
PAYNECTA_API_KEY=hmp_eUfqX5RVBb0HHm239no6bdg6d5CcN9fV9LDUOGuU
PAYNECTA_USER_EMAIL=xknight254@gmail.com
PAYNECTA_PAYMENT_LINK_CODE=
```

### Client `.env`
```
VITE_API_URL=https://xtournament.duckdns.org/api
```

---

## 14. Build & Deployment

### 14.1 Build Process
```bash
# Build client
cd client && npm run build

# Build server
cd ../server && npm run build

# Copy client dist to server
cp -r client/dist server/client/dist
```

### 14.2 Production Start
```bash
cd server && node dist/index.js
```

The Express server serves the SPA static files from `server/client/dist` and handles all API routes.

### 14.3 Domain
- **Domain:** xtournament.duckdns.org (DuckDNS dynamic DNS)
- **SSL:** Let's Encrypt certificate
- **Server:** Self-hosted Linux (7.0.0-15-generic)

---

## 15. Known Issues & Debt

1. **Wager feature is fully built on backend but has zero frontend pages** — needs WagerCreatePage, WagerLobby, WagerMatchRoom
2. **AdminDashboard bypasses API layer** — uses raw `fetch()` instead of `api.admin.*` methods
3. **Dead code** — `server/src/services/mpesaService.ts` should be deleted
4. **Missing pages** — Forgot password, reset password, leaderboard, about, privacy
5. **Tournament edit** — Backend supports it, no frontend form
6. **Match dispute resolution** — Backend has admin endpoint, no admin UI
7. **Standings tab** — Exists in TournamentDetailPage but never fetches data
8. **Rate limiting** — Configured at burst=50 on the server

---

## 16. What Lovable Needs to Know

### To rebuild this in Lovable:

1. **It's a monorepo** — client/ and server/ in one project, but they're independent apps
2. **No ORM** — raw SQL via sql.js (SQLite in-memory). All queries are handwritten in controllers
3. **No state management library** — React Context for auth, useState/useEffect for everything else
4. **Custom routing** — React Router v6 with a custom navigation wrapper (not Next.js)
5. **Single deploy target** — Express serves both API and static SPA files
6. **The wager system is the most complex feature** — involves payment webhooks, state machines, and multi-step flows
7. **OCR is server-side** — Tesseract.js runs on the Node.js server, not in the browser
8. **Telegram integration** — dual purpose: WebApp auth + bot notifications
9. **No test suite** — zero automated tests exist
10. **Design is dark/gaming aesthetic** — black backgrounds, orange accents, Orbitron font for display text
