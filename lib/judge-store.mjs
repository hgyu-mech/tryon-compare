export const UNIT_COST=2;
export const TASK_SECONDS=30*60;

export async function createSession(db,{idHash,passwordVersion,createdAt,expiresAt}){
  await db.prepare('INSERT INTO judge_sessions (id_hash,password_version,created_at,expires_at) VALUES (?,?,?,?)').bind(idHash,passwordVersion,createdAt,expiresAt).run();
}
export async function findSession(db,idHash,passwordVersion,now){
  return db.prepare('SELECT id_hash,expires_at FROM judge_sessions WHERE id_hash=? AND password_version=? AND expires_at>?').bind(idHash,passwordVersion,now).first();
}
export async function removeSession(db,idHash){await db.prepare('DELETE FROM judge_sessions WHERE id_hash=?').bind(idHash).run()}
export async function usedUnits(db){const row=await db.prepare('SELECT COALESCE(SUM(units),0) AS used FROM tryon_attempts').first();return Number(row?.used||0)}

// One SQLite/D1 write statement atomically checks the durable total and inserts
// the reservation. Never split this into a SELECT check and a later INSERT.
// Rows are never refunded/deleted on provider failures or task expiry.
export const RESERVE_SQL=`INSERT INTO tryon_attempts (local_id,owner_hash,units,status,created_at,expires_at,last_poll_at,poll_lock_until)
SELECT ?,?,2,'reserved',?,?,0,0
WHERE (SELECT COALESCE(SUM(units),0) FROM tryon_attempts)+2<=?
RETURNING local_id`;
export async function reserveAttempt(db,{localId,ownerHash,now,limit}){
  return db.prepare(RESERVE_SQL).bind(localId,ownerHash,now,now+TASK_SECONDS,limit).first();
}
export async function ownAttempt(db,localId,ownerHash,now){
  return db.prepare('SELECT * FROM tryon_attempts WHERE local_id=? AND owner_hash=? AND expires_at>?').bind(localId,ownerHash,now).first();
}
export async function submitted(db,localId,providerId){
  await db.prepare("UPDATE tryon_attempts SET provider_task_id=?,status='running' WHERE local_id=? AND status='reserved'").bind(providerId,localId).run();
}
export async function failed(db,localId){await db.prepare("UPDATE tryon_attempts SET status='error',poll_lock_until=0 WHERE local_id=?").bind(localId).run()}
export async function claimPoll(db,localId,ownerHash,now){
  return db.prepare("UPDATE tryon_attempts SET last_poll_at=?,poll_lock_until=? WHERE local_id=? AND owner_hash=? AND status='running' AND expires_at>? AND last_poll_at<=? AND poll_lock_until<=? RETURNING provider_task_id").bind(now,now+35,localId,ownerHash,now,now-10,now).first();
}
export async function pollResult(db,localId,result){
  await db.prepare('UPDATE tryon_attempts SET status=?,result_url=?,poll_lock_until=0 WHERE local_id=?').bind(result.status,result.imageUrl||null,localId).run();
}
export async function releasePoll(db,localId){await db.prepare('UPDATE tryon_attempts SET poll_lock_until=0 WHERE local_id=?').bind(localId).run()}
export async function cleanupExpired(db,now){
  // Preserve all reservation rows/units so expiry cannot replenish the cap.
  await db.prepare("UPDATE tryon_attempts SET provider_task_id=NULL,result_url=NULL,status='expired',poll_lock_until=0 WHERE expires_at<=? AND (provider_task_id IS NOT NULL OR result_url IS NOT NULL)").bind(now).run();
  await db.prepare('DELETE FROM judge_sessions WHERE expires_at<=?').bind(now).run();
  await db.prepare('DELETE FROM judge_login_limits WHERE window_start<=?').bind(now-1800).run();
}
export const LOGIN_WINDOW_SECONDS=900;
export const LOGIN_ATTEMPTS=8;
export async function claimLoginAttempt(db,scopeHash,now){
  return db.prepare(`INSERT INTO judge_login_limits (scope_hash,window_start,attempts) VALUES (?,?,1)
    ON CONFLICT(scope_hash) DO UPDATE SET
      attempts=CASE WHEN judge_login_limits.window_start<=? THEN 1 ELSE judge_login_limits.attempts+1 END,
      window_start=CASE WHEN judge_login_limits.window_start<=? THEN ? ELSE judge_login_limits.window_start END
    WHERE judge_login_limits.window_start<=? OR judge_login_limits.attempts<?
    RETURNING attempts`).bind(scopeHash,now,now-LOGIN_WINDOW_SECONDS,now-LOGIN_WINDOW_SECONDS,now,now-LOGIN_WINDOW_SECONDS,LOGIN_ATTEMPTS).first();
}
export async function clearLoginAttempts(db,scopeHash){await db.prepare('DELETE FROM judge_login_limits WHERE scope_hash=?').bind(scopeHash).run()}
