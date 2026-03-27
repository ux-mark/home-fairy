import type { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null

export function setSocketServer(server: SocketServer): void {
  io = server
}

export function getIO(): SocketServer | null {
  return io
}

export function emit(event: string, data?: unknown): void {
  io?.emit(event, data)
}
