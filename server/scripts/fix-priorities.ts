import Database from 'better-sqlite3'
const db = new Database('./data/thefairies.sqlite')
const scenes = db.prepare('SELECT name, rooms FROM scenes').all() as any[]
let fixed = 0
for (const s of scenes) {
  let rooms: any[]
  try { rooms = JSON.parse(s.rooms || '[]') } catch { continue }
  let changed = false
  for (const r of rooms) {
    if (typeof r.priority === 'string') {
      r.priority = Number(r.priority) || 0
      changed = true
    }
  }
  if (changed) {
    db.prepare("UPDATE scenes SET rooms = ? WHERE name = ?").run(JSON.stringify(rooms), s.name)
    fixed++
  }
}
console.log('Fixed string priorities in', fixed, 'scenes')
db.close()
