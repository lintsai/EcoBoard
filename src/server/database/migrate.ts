import { initDatabase } from './init';

// Run migration
const runMigration = async () => {
  try {
    console.log('Starting database migration...');
    await initDatabase();
    console.log('✓ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
