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
  // Try to find existing user
  const existingUser = await query(
    'SELECT * FROM users WHERE username = $1',
    [userData.username]
  );

  if (existingUser.rows.length > 0) {
    // Update user info
    const updated = await query(
      `UPDATE users 
       SET display_name = $1, email = $2, ldap_dn = $3, updated_at = CURRENT_TIMESTAMP
       WHERE username = $4
       RETURNING *`,
      [userData.displayName, userData.email, userData.ldapDn, userData.username]
    );
    return updated.rows[0];
  }

  // Create new user
  const result = await query(
    `INSERT INTO users (username, display_name, email, ldap_dn)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userData.username, userData.displayName, userData.email, userData.ldapDn]
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
    'SELECT * FROM users WHERE username = $1',
    [username]
  );

  return result.rows[0] || null;
};
