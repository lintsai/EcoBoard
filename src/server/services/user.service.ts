import { query } from '../database/pool';

interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  ldapDn?: string;
}

interface CreateUserData {
  username: string;
  displayName: string;
  email?: string;
  ldapDn?: string;
}

export const createOrGetUser = async (userData: CreateUserData): Promise<User> => {
  // Normalize username to lowercase
  const normalizedUsername = userData.username.toLowerCase();
  
  // Try to find existing user (case-insensitive)
  const existingUser = await query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
    [normalizedUsername]
  );

  if (existingUser.rows.length > 0) {
    // Update user info
    const updated = await query(
      `UPDATE users 
       SET display_name = $1, email = $2, ldap_dn = $3, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(username) = LOWER($4)
       RETURNING *`,
      [userData.displayName, userData.email, userData.ldapDn, normalizedUsername]
    );
    return updated.rows[0];
  }

  // Create new user with normalized username
  const result = await query(
    `INSERT INTO users (username, display_name, email, ldap_dn)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [normalizedUsername, userData.displayName, userData.email, userData.ldapDn]
  );

  return result.rows[0];
};

export const getUserById = async (userId: number): Promise<User | null> => {
  const result = await query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0] || null;
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
  const result = await query(
    'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );

  return result.rows[0] || null;
};
