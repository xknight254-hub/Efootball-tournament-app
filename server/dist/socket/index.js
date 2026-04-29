import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../db.js';
let io;
function authenticateSocket(token) {
    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
        const decoded = jwt.verify(token, JWT_SECRET);
        const blacklisted = db.prepare('SELECT id FROM token_blacklist WHERE token = ? AND expires_at > datetime("now")').get(token);
        if (blacklisted) {
            return null;
        }
        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(decoded.userId);
        if (!user) {
            return null;
        }
        return { userId: user.id, username: user.username };
    }
    catch {
        return null;
    }
}
export function initializeSocket(server) {
    io = new SocketIOServer(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
        },
    });
    io.on('connection', (socket) => {
        console.log('[Socket] Client connected:', socket.id);
        let authenticatedUser = null;
        socket.on('authenticate', (token) => {
            const user = authenticateSocket(token);
            if (user) {
                authenticatedUser = user;
                socket.userId = user.userId;
                socket.username = user.username;
                socket.emit('auth:success', { userId: user.userId, username: user.username });
                console.log(`[Socket] User authenticated: ${user.username} (${socket.id})`);
            }
            else {
                socket.emit('auth:error', 'Invalid or expired token');
            }
        });
        socket.on('join:tournament', (tournamentId) => {
            if (!authenticatedUser) {
                socket.emit('auth:error', 'Authentication required');
                return;
            }
            socket.join(`tournament:${tournamentId}`);
            console.log(`[Socket] ${authenticatedUser.username} joined tournament:${tournamentId}`);
        });
        socket.on('leave:tournament', (tournamentId) => {
            if (!authenticatedUser)
                return;
            socket.leave(`tournament:${tournamentId}`);
        });
        socket.on('join:match', (matchId) => {
            if (!authenticatedUser) {
                socket.emit('auth:error', 'Authentication required');
                return;
            }
            socket.join(`match:${matchId}`);
        });
        socket.on('leave:match', (matchId) => {
            if (!authenticatedUser)
                return;
            socket.leave(`match:${matchId}`);
        });
        socket.on('chat:send', (data) => {
            if (!authenticatedUser) {
                socket.emit('auth:error', 'Authentication required');
                return;
            }
            const { tournamentId, message } = data;
            if (!message || message.trim().length === 0) {
                return;
            }
            const sanitizedMessage = message.slice(0, 500).replace(/[<>]/g, '');
            const timestamp = new Date().toISOString();
            const chatMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                tournamentId,
                message: sanitizedMessage,
                timestamp,
                senderId: authenticatedUser.userId,
                senderUsername: authenticatedUser.username,
            };
            io.to(`tournament:${tournamentId}`).emit('chat:message', chatMessage);
        });
        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected:', socket.id);
        });
    });
    return io;
}
export function getIO() {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
}
//# sourceMappingURL=index.js.map