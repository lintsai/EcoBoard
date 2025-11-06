import pool from './pool';

export const initDatabase = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        ldap_dn VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Team members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, user_id)
      )
    `);

    // Daily check-ins table
    await client.query(`
      CREATE TABLE IF NOT EXISTS checkins (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        checkin_date DATE NOT NULL,
        checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'checked_in',
        UNIQUE(team_id, user_id, checkin_date)
      )
    `);

    // Work items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id SERIAL PRIMARY KEY,
        checkin_id INTEGER REFERENCES checkins(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        item_type VARCHAR(50) DEFAULT 'task',
        session_id VARCHAR(255),
        ai_summary TEXT,
        ai_title VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add AI fields to work_items if they don't exist
    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS session_id VARCHAR(255)`);
    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS ai_summary TEXT`);
    await client.query(`ALTER TABLE work_items ADD COLUMN IF NOT EXISTS ai_title VARCHAR(500)`);

    // Daily standup meetings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS standup_meetings (
        id SERIAL PRIMARY KEY,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        meeting_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'in_progress',
        ai_summary TEXT,
        ai_task_distribution JSONB,
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, meeting_date)
      )
    `);

    // Work updates table (for end-of-day updates)
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_updates (
        id SERIAL PRIMARY KEY,
        work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        update_content TEXT NOT NULL,
        progress_status VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Daily summaries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        summary_date DATE NOT NULL,
        -- new canonical summary column (may be added to existing tables via ALTER below)
        summary_content TEXT,
        -- user who generated the summary
        generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- keep UNIQUE constraint where possible
        UNIQUE(team_id, summary_date)
      )
    `);

    // Ensure new columns exist in case the table was created with an older schema
    await client.query(`ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS summary_content TEXT`);
    await client.query(`ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    // Backfill summary_content from older columns if present (morning_summary, evening_summary, ai_analysis)
    await client.query(`
      UPDATE daily_summaries
      SET summary_content = COALESCE(summary_content, morning_summary, evening_summary, ai_analysis::text)
      WHERE summary_content IS NULL
    `);

    // Chat messages table (for AI conversation history)
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        session_id VARCHAR(255),
        message_type VARCHAR(50),
        content TEXT NOT NULL,
        ai_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(checkin_date);
      CREATE INDEX IF NOT EXISTS idx_checkins_team ON checkins(team_id);
      CREATE INDEX IF NOT EXISTS idx_work_items_user ON work_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_work_items_session ON work_items(session_id);
      CREATE INDEX IF NOT EXISTS idx_standup_meetings_date ON standup_meetings(meeting_date);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_daily_summaries_team_date ON daily_summaries(team_id, summary_date);
      CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(summary_date);
    `);

    await client.query('COMMIT');
    console.log('✓ Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};
