import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
export interface ServerToClientEvents {
    'tournament:created': (data: any) => void;
    'tournament:update': (data: any) => void;
    'tournament:deleted': (data: any) => void;
    'match:update': (data: any) => void;
    'participant:joined': (data: any) => void;
    'notification:new': (notification: any) => void;
    'chat:message': (message: any) => void;
    'chat:history': (messages: any[]) => void;
    'auth:success': (data: {
        userId: number;
        username: string;
    }) => void;
    'auth:error': (error: string) => void;
}
export interface ClientToServerEvents {
    'join:tournament': (tournamentId: string) => void;
    'leave:tournament': (tournamentId: string) => void;
    'join:match': (matchId: string) => void;
    'leave:match': (matchId: string) => void;
    'join:user': (userId: string) => void;
    'chat:send': (data: {
        tournamentId: string;
        message: string;
    }) => void;
    'chat:history': (tournamentId: string) => void;
    'authenticate': (token: string) => void;
}
export declare function initializeSocket(server: HttpServer): SocketIOServer;
export declare function getIO(): SocketIOServer;
//# sourceMappingURL=index.d.ts.map