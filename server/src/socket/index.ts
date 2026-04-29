import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer;

export interface ServerToClientEvents {
  'tournament:update': (data: any) => void;
  'match:update': (data: any) => void;
  'notification:new': (notification: any) => void;
  'chat:message': (message: any) => void;
  'chat:history': (messages: any[]) => void;
}

export interface ClientToServerEvents {
  'join:tournament': (tournamentId: string) => void;
  'leave:tournament': (tournamentId: string) => void;
  'join:match': (matchId: string) => void;
  'leave:match': (matchId: string) => void;
  'chat:send': (data: { tournamentId: string; message: string }) => void;
  'chat:history': (tournamentId: string) => void;
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

    socket.on('join:tournament', (tournamentId: string) => {
      socket.join(`tournament:${tournamentId}`);
      console.log(`[Socket] ${socket.id} joined tournament:${tournamentId}`);
    });

    socket.on('leave:tournament', (tournamentId: string) => {
      socket.leave(`tournament:${tournamentId}`);
    });

    socket.on('join:match', (matchId: string) => {
      socket.join(`match:${matchId}`);
    });

    socket.on('leave:match', (matchId: string) => {
      socket.leave(`match:${matchId}`);
    });

    socket.on('chat:send', (data) => {
      const { tournamentId, message } = data;
      const timestamp = new Date().toISOString();
      
      const chatMessage = {
        id: `msg_${Date.now()}`,
        tournamentId,
        message,
        timestamp,
        senderId: socket.id,
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