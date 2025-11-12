import dotenv from 'dotenv';
import { query } from '../src/server/database/pool';

dotenv.config();

async function checkUsers() {
  try {
    console.log('Checking existing users...\n');
    
    // Get all users
    const users = await query('SELECT id, username, display_name FROM users ORDER BY id');
    
    console.log('Current users:');
    users.rows.forEach(user => {
      console.log(`  ID ${user.id}: "${user.username}" (${user.display_name})`);
    });
    
    console.log('\nChecking for potential duplicates after normalization:');
    
    // Check what usernames would become after normalization
    const normalized = users.rows.map(user => {
      const original = user.username;
      const withoutDomain = original.includes('@') 
        ? original.split('@')[0] 
        : original;
      const normalized = withoutDomain.toLowerCase();
      return {
        id: user.id,
        original,
        normalized
      };
    });
    
    // Group by normalized name
    const groups = new Map<string, typeof normalized>();
    normalized.forEach(item => {
      const existing = groups.get(item.normalized) || [];
      existing.push(item);
      groups.set(item.normalized, existing);
    });
    
    // Show duplicates
    let hasDuplicates = false;
    groups.forEach((items, normalizedName) => {
      if (items.length > 1) {
        hasDuplicates = true;
        console.log(`\n⚠️  Duplicate found for "${normalizedName}":`);
        items.forEach(item => {
          console.log(`     ID ${item.id}: "${item.original}" → "${item.normalized}"`);
        });
      }
    });
    
    if (!hasDuplicates) {
      console.log('  ✓ No duplicates found - safe to proceed with normalization');
    } else {
      console.log('\n❌ Duplicates detected! You need to merge or delete duplicate accounts first.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
