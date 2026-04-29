import db, { initializeDatabase } from '../db.js';

export async function connectDatabase() {
  try {
    initializeDatabase();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

export default db;