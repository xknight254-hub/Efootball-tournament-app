import { Database as SqlJsDatabase } from 'sql.js';
export declare function isAdminPhone(phone: string): boolean;
export declare function addAdminPhone(phone: string, label?: string): boolean;
export declare function isFreeUser(phone: string): boolean;
export declare function grantPasses(phone: string, n: number): boolean;
export declare function consumeFreePass(phone: string): boolean;
export declare function initDB(): Promise<SqlJsDatabase>;
export declare function initializeDatabase(): void;
export declare const db: any;
export default db;
//# sourceMappingURL=db.d.ts.map