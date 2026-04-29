import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

function getToken(): string | null {
  return localStorage.getItem('token');
}

class SocketService {
  private socket: Socket | null = null;
  private tournamentId: number | null = null;
  private messageHandlers: ((data: any) => void)[] = [];
  private connectionHandlers: ((connected: boolean) => void)[] = [];

  connect(tournamentId: number) {
    if (this.socket?.connected && this.tournamentId === tournamentId) {
      return;
    }

    this.disconnect();
    this.tournamentId = tournamentId;

    const token = getToken();
    if (!token) {
      console.warn('Cannot connect to socket: no auth token');
      return;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      this.socket?.emit('join:tournament', String(tournamentId));
      this.connectionHandlers.forEach(h => h(true));
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      this.connectionHandlers.forEach(h => h(false));
    });

    this.socket.on('chat:message', (data) => {
      this.messageHandlers.forEach(h => h(data));
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.tournamentId = null;
    }
  }

  sendMessage(message: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:send', {
        tournamentId: this.tournamentId,
        message,
      });
    }
  }

  onMessage(handler: (data: any) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onConnectionChange(handler: (connected: boolean) => void) {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();