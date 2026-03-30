import { run } from '../db/index.js'

export function logUserAction(
  userId: string,
  userName: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
): void {
  run(
    'INSERT INTO user_actions (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, userName, action, entityType, entityId, details ? JSON.stringify(details) : null],
  )
}
