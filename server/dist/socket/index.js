import { Server as SocketIOServer } from 'socket.io';
let io;
export function initializeSocket(server) {
    io = new SocketIOServer(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
        },
    });
    io.on('connection', (socket) => {
        console.log('[Socket] Client connected:', socket.id);
        socket.on('join:tournament', (tournamentId) => {
            socket.join(`tournament:${tournamentId}`);
            console.log(`[Socket] ${socket.id} joined tournament:${tournamentId}`);
        });
        socket.on('leave:tournament', (tournamentId) => {
            socket.leave(`tournament:${tournamentId}`);
        });
        socket.on('join:match', (matchId) => {
            socket.join(`match:${matchId}`);
        });
        socket.on('leave:match', (matchId) => {
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
export function getIO() {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
}
//# sourceMappingURL=index.js.map