import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connected = false;

export function initSocket(): Socket {
  if (socket) return socket;

  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    connected = true;
    console.log('[Socket] Connected:', socket?.id);

    // Authenticate if token exists
    const token = localStorage.getItem('toss_api_token');
    if (token) {
      socket?.emit('authenticate', token);
    }
  });

  socket.on('disconnect', () => {
    connected = false;
    console.log('[Socket] Disconnected');
  });

  socket.on('auth:success', (data: any) => {
    console.log('[Socket] Authenticated:', data.username);
  });

  socket.on('auth:error', (error: string) => {
    console.warn('[Socket] Auth error:', error);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function isSocketConnected(): boolean {
  return connected;
}

export function joinTournamentRoom(tournamentId: string) {
  socket?.emit('join:tournament', tournamentId);
}

export function leaveTournamentRoom(tournamentId: string) {
  socket?.emit('leave:tournament', tournamentId);
}

export function onTournamentCreated(callback: (tournament: any) => void) {
  socket?.on('tournament:created', callback);
  return () => { socket?.off('tournament:created', callback); };
}

export function onTournamentDeleted(callback: (data: { id: number }) => void) {
  socket?.on('tournament:deleted', callback);
  return () => { socket?.off('tournament:deleted', callback); };
}

export function onTournamentUpdate(callback: (data: any) => void) {
  socket?.on('tournament:update', callback);
  return () => { socket?.off('tournament:update', callback); };
}

export function onParticipantJoined(callback: (data: any) => void) {
  socket?.on('participant:joined', callback);
  return () => { socket?.off('participant:joined', callback); };
}

export function onMatchUpdate(callback: (data: any) => void) {
  socket?.on('match:update', callback);
  return () => { socket?.off('match:update', callback); };
}

export function onNotification(callback: (notification: any) => void) {
  socket?.on('notification:new', callback);
  return () => { socket?.off('notification:new', callback); };
}

export function onChatMessage(callback: (message: any) => void) {
  socket?.on('chat:message', callback);
  return () => { socket?.off('chat:message', callback); };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
  }
}
