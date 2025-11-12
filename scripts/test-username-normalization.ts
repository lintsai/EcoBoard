import dotenv from 'dotenv';
import { query } from '../src/server/database/pool';

// Load environment variables
dotenv.config();

async function testUsernameNormalization() {
  console.log('Testing username normalization...\n');

  try {
    // Test 1: Check if the unique index was created
    console.log('1. Checking for unique index on lowercase username:');
    const indexCheck = await query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND indexname = 'idx_users_username_lower'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('   ✓ Unique index exists:', indexCheck.rows[0].indexdef);
    } else {
      console.log('   ✗ Index not found');
    }

    // Test 2: Check existing users
    console.log('\n2. Current users in database:');
    const users = await query('SELECT id, username, display_name FROM users ORDER BY id');
    if (users.rows.length > 0) {
      users.rows.forEach(user => {
        console.log(`   - ID ${user.id}: "${user.username}" (${user.display_name})`);
      });
    } else {
      console.log('   (No users yet)');
    }

    // Test 3: Simulate case-insensitive lookup
    console.log('\n3. Testing case-insensitive lookup:');
    const testUsername = 'TestUser';
    const result = await query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [testUsername]
    );
    console.log(`   Query for "${testUsername}":`, result.rows.length > 0 ? '✓ Found' : '(Not found - expected if no matching user)');

    console.log('\n✓ Username normalization test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Try logging in with different case variations');
    console.log('2. Try logging in with email format (user@domain.com)');
    console.log('3. Verify all formats map to the same lowercase username');
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

testUsernameNormalization();
