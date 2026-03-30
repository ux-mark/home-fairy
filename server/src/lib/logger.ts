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
): void {
  try {
    run(
      'INSERT INTO logs (message, category, user_id, user_name, debug) VALUES (?, ?, ?, ?, ?)',
      [message, category ?? 'system', user?.id ?? null, user?.name ?? null, debug ?? null],
    )
  } catch {
    console.error('Failed to write log:', message)
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
