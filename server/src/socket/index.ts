import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../db.js';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  username?: string;
}

let io: SocketIOServer;

export interface ServerToClientEvents {
  'tournament:created': (data: any) => void;
  'tournament:update': (data: any) => void;
  'tournament:deleted': (data: any) => void;
  'match:update': (data: any) => void;
  'participant:joined': (data: any) => void;
  'notification:new': (notification: any) => void;
  'chat:message': (message: any) => void;
  'chat:history': (messages: any[]) => void;
  'auth:success': (data: { userId: number; username: string }) => void;
  'auth:error': (error: string) => void;
}

export interface ClientToServerEvents {
  'join:tournament': (tournamentId: string) => void;
  'leave:tournament': (tournamentId: string) => void;
  'join:match': (matchId: string) => void;
  'leave:match': (matchId: string) => void;
  'join:user': (userId: string) => void;
  'chat:send': (data: { tournamentId: string; message: string }) => void;
  'chat:history': (tournamentId: string) => void;
  'authenticate': (token: string) => void;
}

function authenticateSocket(token: string): { userId: number; username: string } | null {
  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    const blacklisted = db.prepare(
      'SELECT id FROM token_blacklist WHERE token = ? AND expires_at > datetime("now")'
    ).get(token);

    if (blacklisted) {
      return null;
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(decoded.userId) as { id: number; username: string } | undefined;

    if (!user) {
      return null;
    }

    return { userId: user.id, username: user.username };
  } catch {
    return null;
  }
}

export function initializeSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    let authenticatedUser: { userId: number; username: string } | null = null;

    socket.on('authenticate', (token: string) => {
      const user = authenticateSocket(token);
      if (user) {
        authenticatedUser = user;
        (socket as any).userId = user.userId;
        (socket as any).username = user.username;
        socket.join(`user:${user.userId}`);
        socket.emit('auth:success', { userId: user.userId, username: user.username });
        console.log(`[Socket] User authenticated: ${user.username} (${socket.id})`);
      } else {
        socket.emit('auth:error', 'Invalid or expired token');
      }
    });

    socket.on('join:tournament', (tournamentId: string) => {
      if (!authenticatedUser) {
        socket.emit('auth:error', 'Authentication required');
        return;
      }
      socket.join(`tournament:${tournamentId}`);
      console.log(`[Socket] ${authenticatedUser.username} joined tournament:${tournamentId}`);
    });

    socket.on('leave:tournament', (tournamentId: string) => {
      if (!authenticatedUser) return;
      socket.leave(`tournament:${tournamentId}`);
    });

    socket.on('join:match', (matchId: string) => {
      if (!authenticatedUser) {
        socket.emit('auth:error', 'Authentication required');
        return;
      }
      socket.join(`match:${matchId}`);
    });

    socket.on('leave:match', (matchId: string) => {
      if (!authenticatedUser) return;
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

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}
