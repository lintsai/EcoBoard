import { Pool, PoolClient, PoolConfig, types } from 'pg';

// Force pg to return raw strings for date/timestamp fields so frontend can render exactly what was stored
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value: string) => value);

const normalize = (v: any) => (typeof v === 'string' ? v : (v == null ? undefined : String(v)));

// Build pool config with support for DATABASE_URL and explicit fields
const buildPoolConfig = (): PoolConfig => {
  const useConnStr = normalize(process.env.DATABASE_URL);
  const sslEnabled = (process.env.DB_SSL || '').toLowerCase() === 'true';

  if (useConnStr) {
    const cfg: PoolConfig = {
      connectionString: useConnStr,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
    if (sslEnabled) {
      // In many on-prem/self-hosted cases, cert validation isn't configured; allow disable via DB_SSL_REJECT_UNAUTHORIZED=false
      const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';
      cfg.ssl = { rejectUnauthorized } as any;
    }
    return cfg;
  }

  // Force string conversion with extra safety for password
  const dbPassword = process.env.DB_PASSWORD;
  const passwordStr = dbPassword ? String(dbPassword) : '';
  
  // Debug log to diagnose the issue
  console.log('[DB_CONFIG] Password type:', typeof dbPassword, 'Length:', passwordStr.length);
  console.log('[DB_CONFIG] All env types:', {
    host: typeof process.env.DB_HOST,
    port: typeof process.env.DB_PORT,
    database: typeof process.env.DB_NAME,
    user: typeof process.env.DB_USER,
    password: typeof dbPassword
  });

  const cfg: PoolConfig = {
    host: normalize(process.env.DB_HOST),
    port: parseInt(process.env.DB_PORT || '5432'),
    database: normalize(process.env.DB_NAME),
    user: normalize(process.env.DB_USER),
    password: passwordStr, // Use explicit string conversion instead of normalize
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  if (sslEnabled) {
    const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';
    (cfg as any).ssl = { rejectUnauthorized };
  }

  return cfg;
};

// Lazy initialization: create pool only when first accessed
let pool: Pool | null = null;

const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      const exitOnDbError = (process.env.EXIT_ON_DB_ERROR || 'true').toLowerCase() === 'true';
      if (exitOnDbError) {
        process.exit(-1);
      }
    });
  }
  return pool;
};

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    console.log('[QUERY] Executing:', { text: text.substring(0, 100), paramCount: params?.length });
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    console.log('[QUERY] Success:', { duration, rows: res.rowCount });
    return res;
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error('[QUERY] Error:', {
      duration,
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      sql: text.substring(0, 200),
      paramCount: params?.length
    });
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await getPool().connect();
  return client;
};

// Export an object with a connect method for compatibility
export default {
  query,
  connect: async () => getPool().connect(),
  end: async () => pool ? pool.end() : Promise.resolve(),
};
