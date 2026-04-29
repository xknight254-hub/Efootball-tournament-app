# eFootball Tournament App 🏆⚽

A competitive platform for eFootball tournaments with match result submission and real-time chat.

## Features

- **User Authentication** - Register, login, logout with JWT tokens
- **Tournament Management** - Create, join, and manage knockout/league tournaments
- **Match Results** - Submit scores with screenshots, confirm/dispute flow
- **Real-time Chat** - Socket.IO powered tournament chat
- **Modern UI** - Dark theme with neon accents, glassmorphism

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + Socket.IO + SQLite
- **Database**: better-sqlite3 (SQLite)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/xknight254-hub/Efootball-tournament-app.git
cd efootball-tournament-app

# Install dependencies
npm install

# Install client and server dependencies
cd client && npm install
cd ../server && npm install
```

### Running the App

```bash
# Start the server (from server directory)
cd server
npm run dev

# Start the frontend (from client directory, in a new terminal)
cd client
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Building for Production

```bash
npm run build
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Tournaments
- `GET /api/tournaments` - List tournaments
- `POST /api/tournaments` - Create tournament
- `GET /api/tournaments/:id` - Get tournament details
- `PUT /api/tournaments/:id` - Update tournament
- `DELETE /api/tournaments/:id` - Delete tournament

### Matches
- `GET /api/matches/tournament/:tournamentId` - Get tournament matches
- `POST /api/matches/:id/result` - Submit match result
- `POST /api/matches/:id/confirm` - Confirm result
- `POST /api/matches/:id/dispute` - Dispute result

## Security Features

- JWT authentication with token blacklist
- Rate limiting (100 req/15min global, 10 req/15min auth)
- SQL injection protection
- Input sanitization
- Strong password policy (8+ chars, uppercase, lowercase, number)
- Admin audit logging

## License

MIT