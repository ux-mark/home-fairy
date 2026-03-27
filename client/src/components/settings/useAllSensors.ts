import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAllSensors() {
  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.rooms.getAll,
  })
  return useMemo(() => {
    if (!rooms) return []
    const sensors: { name: string; room: string }[] = []
    for (const room of rooms) {
      if (room.sensors) {
        for (const sensor of room.sensors) {
          sensors.push({ name: sensor.name, room: room.name })
        }
      }
    }
    return sensors
  }, [rooms])
}
