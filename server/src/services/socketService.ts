import { getIO } from '../socket';

export function emitTournamentUpdate(tournamentId: string, data: any) {
  const io = getIO();
  io.to(`tournament:${tournamentId}`).emit('tournament:update', data);
}

export function emitMatchUpdate(tournamentId: string, matchId: string, data: any) {
  const io = getIO();
  io.to(`tournament:${tournamentId}`).emit('match:update', {
    matchId,
    ...data,
  });
}

export function emitNotification(userId: string, notification: any) {
  const io = getIO();
  io.to(`user:${userId}`).emit('notification:new', notification);
}

export function emitChatMessage(tournamentId: string, message: any) {
  const io = getIO();
  io.to(`tournament:${tournamentId}`).emit('chat:message', message);
}