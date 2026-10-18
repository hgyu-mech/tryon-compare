import {integer,sqliteTable,text,index} from 'drizzle-orm/sqlite-core';

export const judgeSessions=sqliteTable('judge_sessions',{
  idHash:text('id_hash').primaryKey(),
  passwordVersion:text('password_version').notNull(),
  createdAt:integer('created_at').notNull(),
  expiresAt:integer('expires_at').notNull(),
});

// Reservation rows are the durable spending ledger. Do not purge expired or
// failed attempts: expiry affects access, not the already-reserved budget.
export const tryonAttempts=sqliteTable('tryon_attempts',{
  localId:text('local_id').primaryKey(),
  ownerHash:text('owner_hash').notNull(),
  units:integer('units').notNull().default(2),
  status:text('status').notNull().default('reserved'),
  providerTaskId:text('provider_task_id'),
  resultUrl:text('result_url'),
  createdAt:integer('created_at').notNull(),
  expiresAt:integer('expires_at').notNull(),
  lastPollAt:integer('last_poll_at').notNull().default(0),
  pollLockUntil:integer('poll_lock_until').notNull().default(0),
},table=>[index('tryon_owner_idx').on(table.ownerHash,table.localId)]);

export const judgeLoginLimits=sqliteTable('judge_login_limits',{
  scopeHash:text('scope_hash').primaryKey(),
  windowStart:integer('window_start').notNull(),
  attempts:integer('attempts').notNull().default(0),
});
