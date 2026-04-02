import { run } from '../db/index.js'

export interface LogUser {
  id: string
  name: string
}

export function log(
  message: string,
  category?: string,
  user?: LogUser | null,
  debug?: string,
  parentId?: number,
): number {
  try {
    return run(
      'INSERT INTO logs (parent_id, message, category, user_id, user_name, debug) VALUES (?, ?, ?, ?, ?, ?)',
      [parentId ?? null, message, category ?? 'system', user?.id ?? null, user?.name ?? null, debug ?? null],
    ).lastInsertRowid as number
  } catch {
    console.error('Failed to write log:', message)
    return 0
  }
}

export function logChild(
  parentId: number,
  seq: number,
  message: string,
  category?: string,
  user?: LogUser | null,
  debug?: string,
): void {
  try {
    run(
      'INSERT INTO logs (parent_id, seq, message, category, user_id, user_name, debug) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [parentId, seq, message, category ?? 'system', user?.id ?? null, user?.name ?? null, debug ?? null],
    )
  } catch {
    console.error('Failed to write log:', message)
  }
}
