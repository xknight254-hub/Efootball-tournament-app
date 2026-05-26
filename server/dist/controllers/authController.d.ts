import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
export declare function register(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function login(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getMe(req: AuthRequest, res: Response): Response<any, Record<string, any>> | undefined;
export declare function getUserById(req: AuthRequest, res: Response): Response<any, Record<string, any>> | undefined;
export declare function updateProfile(req: AuthRequest, res: Response): Response<any, Record<string, any>> | undefined;
export declare function logout(req: AuthRequest, res: Response): Response<any, Record<string, any>> | undefined;
export declare function forgotPassword(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function resetPassword(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=authController.d.ts.map