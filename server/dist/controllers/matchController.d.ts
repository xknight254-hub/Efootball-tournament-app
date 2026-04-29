import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare function getTournamentMatches(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getMatchById(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function submitResult(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function confirmResult(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function disputeResult(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function resolveDispute(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=matchController.d.ts.map