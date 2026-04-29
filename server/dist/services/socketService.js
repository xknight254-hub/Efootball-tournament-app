import { getIO } from '../socket';
export function emitTournamentUpdate(tournamentId, data) {
    const io = getIO();
    io.to(`tournament:${tournamentId}`).emit('tournament:update', data);
}
export function emitMatchUpdate(tournamentId, matchId, data) {
    const io = getIO();
    io.to(`tournament:${tournamentId}`).emit('match:update', {
        matchId,
        ...data,
    });
}
export function emitNotification(userId, notification) {
    const io = getIO();
    io.to(`user:${userId}`).emit('notification:new', notification);
}
export function emitChatMessage(tournamentId, message) {
    const io = getIO();
    io.to(`tournament:${tournamentId}`).emit('chat:message', message);
}
//# sourceMappingURL=socketService.js.map