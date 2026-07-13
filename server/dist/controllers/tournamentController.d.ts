import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare function logAdminAction(adminId: number, action: string, details: string): void;
export declare function createTournament(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getTournaments(req: AuthRequest, res: Response): Promise<void>;
export declare function getTournamentById(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getParticipants(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getStandings(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function updateTournamentStatus(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function updateTournament(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function deleteTournament(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function joinTournament(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function withdrawFromTournament(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function joinWaitingList(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=tournamentController.d.ts.map