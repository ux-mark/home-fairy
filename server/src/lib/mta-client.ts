// MTA real-time data client
// Uses MTA GTFS-RT feed for subway arrival predictions
// Endpoint: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs
// For now, create a stub that returns mock data since we don't have the MTA API key
// The structure should match what the old system used

export interface SubwayArrival {
  routeId: string
  direction: 'N' | 'S'
  arrivalTime: Date
  minutesAway: number
}

export const mtaClient = {
  async getArrivals(station: string = '103', direction: string = 'both'): Promise<SubwayArrival[]> {
    // TODO: Implement with real MTA GTFS-RT feed when API key is available
    // For now return empty array - the endpoint exists but needs configuration
    void station
    void direction
    return []
  }
}
