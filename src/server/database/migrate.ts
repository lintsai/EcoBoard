import dotenv from 'dotenv';
import { initDatabase } from './init';
import pool from './pool';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Run specific migration file
const runMigrationFile = async (filename: string) => {
  const filePath = path.join(__dirname, 'migrations', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`Migration file not found: ${filename}`);
    return;
  }
  
  console.log(`Executing migration: ${filename}`);
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  try {
    const client = await pool.connect();
    try {
      await client.query(sql);
      console.log(`✓ ${filename} completed`);
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error(`✗ ${filename} failed:`, error.message);
    throw error;
  }
};

// Run migration
const runMigration = async () => {
  try {
    console.log('Starting database migration...');
    
    // Step 1: Initialize database schema
    await initDatabase();
    
    // Step 2: Run username normalization migration
    await runMigrationFile('007_normalize_usernames.sql');
    
    console.log('✓ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
