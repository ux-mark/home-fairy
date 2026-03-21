// MTA subway stops reference data
// Curated list of stations with correct GTFS stop IDs
// Source: MTA GTFS static data (stops.txt)

export interface MtaStop {
  stopId: string        // MTA stop ID (e.g. "120")
  name: string          // Human name (e.g. "103rd St")
  lines: string[]       // Routes that stop here (e.g. ["1"])
  feedGroup: string     // Which GTFS feed (e.g. "123456S", "BDFM")
  borough: string       // Manhattan, Brooklyn, Queens, Bronx, Staten Island
}

export const MTA_STOPS: MtaStop[] = [
  // ── 1/2/3 Line (IRT Broadway-7th Ave) ───────────────────────────────────────
  // Bronx
  { stopId: '101', name: 'Van Cortlandt Park-242nd St', lines: ['1'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '103', name: '238th St', lines: ['1'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '104', name: '231st St', lines: ['1'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '106', name: 'Marble Hill-225th St', lines: ['1'], feedGroup: '123456S', borough: 'Bronx' },

  // Manhattan — 1/2/3
  { stopId: '107', name: '215th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '108', name: '207th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '109', name: 'Dyckman St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '110', name: '191st St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '111', name: '181st St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '112', name: '168th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '113', name: '157th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '114', name: '145th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '115', name: '137th St-City College', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '116', name: '125th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '117', name: '116th St-Columbia University', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '118', name: 'Cathedral Pkwy-110th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '119', name: '103rd St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '120', name: '96th St', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '121', name: '86th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '122', name: '79th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '123', name: '72nd St', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '124', name: '66th St-Lincoln Center', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '125', name: '59th St-Columbus Circle', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '126', name: '50th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '127', name: 'Times Sq-42nd St', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '128', name: '34th St-Penn Station', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '129', name: '28th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '130', name: '23rd St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '131', name: '18th St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '132', name: '14th St', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '133', name: 'Christopher St-Sheridan Sq', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '134', name: 'Houston St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '135', name: 'Canal St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '136', name: 'Franklin St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '137', name: 'Chambers St', lines: ['1', '2', '3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '138', name: 'Cortlandt St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '139', name: 'Rector St', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '140', name: 'South Ferry', lines: ['1'], feedGroup: '123456S', borough: 'Manhattan' },

  // 2/3 Express (additional stops in Bronx/Brooklyn not on local 1)
  { stopId: '201', name: 'Wakefield-241st St', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '204', name: '233rd St', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '205', name: '225th St', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '206', name: '219th St', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '207', name: 'Gun Hill Rd', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '208', name: 'Burke Ave', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '209', name: 'Allerton Ave', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '210', name: 'Pelham Pkwy', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '211', name: 'Bronx Park East', lines: ['2'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '212', name: 'E 180th St', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '213', name: 'West Farms Sq-E Tremont Ave', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '214', name: '174th St', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '215', name: 'Freeman St', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '216', name: 'Simpson St', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '217', name: 'Intervale Ave', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '218', name: 'Prospect Ave', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '219', name: 'Jackson Ave', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '220', name: '3rd Ave-149th St', lines: ['2', '5'], feedGroup: '123456S', borough: 'Bronx' },
  { stopId: '222', name: '149th St-Grand Concourse', lines: ['2', '5'], feedGroup: '123456S', borough: 'Manhattan' },

  // 3 Train northern terminus
  { stopId: '301', name: 'Harlem-148th St', lines: ['3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '302', name: '145th St', lines: ['3'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '224', name: '135th St', lines: ['2', '3'], feedGroup: '123456S', borough: 'Manhattan' },

  // ── 4/5/6 Line (IRT Lexington Ave) ─────────────────────────────────────────
  { stopId: '621', name: '125th St', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '622', name: '116th St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '623', name: '110th St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '624', name: '103rd St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '625', name: '96th St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '626', name: '86th St', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '627', name: '77th St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '628', name: '68th St-Hunter College', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '629', name: '59th St', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '630', name: '51st St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '631', name: 'Grand Central-42nd St', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '632', name: '33rd St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '633', name: '28th St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '634', name: '23rd St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '635', name: '14th St-Union Sq', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '636', name: 'Astor Pl', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '637', name: 'Bleecker St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '638', name: 'Spring St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '639', name: 'Canal St', lines: ['6'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '640', name: 'Brooklyn Bridge-City Hall', lines: ['4', '5', '6'], feedGroup: '123456S', borough: 'Manhattan' },

  // ── A/C/E Line (IND 8th Ave) ───────────────────────────────────────────────
  { stopId: 'A02', name: 'Inwood-207th St', lines: ['A'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A03', name: 'Dyckman St', lines: ['A'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A05', name: '190th St', lines: ['A'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A06', name: '181st St', lines: ['A'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A07', name: '175th St', lines: ['A'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A09', name: '168th St', lines: ['A', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A10', name: '163rd St-Amsterdam Ave', lines: ['C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A11', name: '155th St', lines: ['C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A12', name: '145th St', lines: ['A', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A14', name: '135th St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A15', name: '125th St', lines: ['A', 'B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A16', name: '116th St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A17', name: 'Cathedral Pkwy-110th St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A18', name: '103rd St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A19', name: '96th St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A20', name: '86th St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A21', name: '81st St-Museum of Natural History', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A22', name: '72nd St', lines: ['B', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A24', name: '59th St-Columbus Circle', lines: ['A', 'B', 'C', 'D'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A25', name: '50th St', lines: ['C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A27', name: '42nd St-Port Authority', lines: ['A', 'C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A28', name: '34th St-Penn Station', lines: ['A', 'C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A30', name: '23rd St', lines: ['C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A31', name: '14th St', lines: ['A', 'C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A32', name: 'W 4th St-Washington Sq', lines: ['A', 'B', 'C', 'D', 'E', 'F', 'M'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A33', name: 'Spring St', lines: ['C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A34', name: 'Canal St', lines: ['A', 'C', 'E'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A36', name: 'Chambers St', lines: ['A', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },
  { stopId: 'A38', name: 'Fulton St', lines: ['A', 'C'], feedGroup: 'ACE', borough: 'Manhattan' },

  // ── B/D/F/M Line (IND 6th Ave) ─────────────────────────────────────────────
  { stopId: 'D03', name: '145th St', lines: ['B', 'D'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D04', name: '135th St', lines: ['B'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D05', name: '125th St', lines: ['B', 'D'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D09', name: '59th St-Columbus Circle', lines: ['B', 'D'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D10', name: '7th Ave', lines: ['B', 'D', 'E'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D11', name: '47-50th Sts-Rockefeller Ctr', lines: ['B', 'D', 'F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D12', name: '42nd St-Bryant Park', lines: ['B', 'D', 'F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D13', name: '34th St-Herald Sq', lines: ['B', 'D', 'F', 'M', 'N', 'Q', 'R', 'W'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D14', name: '23rd St', lines: ['F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D15', name: '14th St', lines: ['F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D16', name: 'W 4th St-Washington Sq', lines: ['B', 'D', 'F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D17', name: 'Broadway-Lafayette St', lines: ['B', 'D', 'F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D19', name: '2nd Ave', lines: ['F'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D20', name: 'Delancey St-Essex St', lines: ['F', 'M'], feedGroup: 'BDFM', borough: 'Manhattan' },
  { stopId: 'D21', name: 'East Broadway', lines: ['F'], feedGroup: 'BDFM', borough: 'Manhattan' },

  // ── N/Q/R/W Line (BMT Broadway) ────────────────────────────────────────────
  { stopId: 'R14', name: '49th St', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R15', name: 'Times Sq-42nd St', lines: ['N', 'Q', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R16', name: '34th St-Herald Sq', lines: ['N', 'Q', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R17', name: '28th St', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R18', name: '23rd St', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R19', name: '14th St-Union Sq', lines: ['N', 'Q', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R20', name: '8th St-NYU', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R21', name: 'Prince St', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R22', name: 'Canal St', lines: ['N', 'Q', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R23', name: 'City Hall', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },
  { stopId: 'R24', name: 'Cortlandt St', lines: ['N', 'R', 'W'], feedGroup: 'NQRW', borough: 'Manhattan' },

  // ── 7 Line (IRT Flushing) ──────────────────────────────────────────────────
  { stopId: '723', name: 'Times Sq-42nd St', lines: ['7'], feedGroup: '123456S', borough: 'Manhattan' },
  { stopId: '724', name: '34th St-Hudson Yards', lines: ['7'], feedGroup: '123456S', borough: 'Manhattan' },

  // ── L Line (BMT Canarsie) ──────────────────────────────────────────────────
  { stopId: 'L01', name: '8th Ave', lines: ['L'], feedGroup: 'L', borough: 'Manhattan' },
  { stopId: 'L02', name: '6th Ave', lines: ['L'], feedGroup: 'L', borough: 'Manhattan' },
  { stopId: 'L03', name: 'Union Sq-14th St', lines: ['L'], feedGroup: 'L', borough: 'Manhattan' },
  { stopId: 'L05', name: '3rd Ave', lines: ['L'], feedGroup: 'L', borough: 'Manhattan' },
  { stopId: 'L06', name: '1st Ave', lines: ['L'], feedGroup: 'L', borough: 'Manhattan' },

  // ── Key Brooklyn stops (for reference) ──────────────────────────────────────
  { stopId: '235', name: 'Atlantic Ave-Barclays Ctr', lines: ['2', '3'], feedGroup: '123456S', borough: 'Brooklyn' },
  { stopId: 'A41', name: 'Jay St-MetroTech', lines: ['A', 'C', 'F'], feedGroup: 'ACE', borough: 'Brooklyn' },
  { stopId: 'R28', name: 'Jay St-MetroTech', lines: ['N', 'R'], feedGroup: 'NQRW', borough: 'Brooklyn' },
  { stopId: 'D24', name: 'Atlantic Ave-Barclays Ctr', lines: ['B', 'D', 'N', 'Q', 'R'], feedGroup: 'BDFM', borough: 'Brooklyn' },
]

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Get all stops for a given borough.
 */
export function getStopsByBorough(borough: string): MtaStop[] {
  const lower = borough.toLowerCase()
  return MTA_STOPS.filter(s => s.borough.toLowerCase() === lower)
}

/**
 * Search stops by name or line. Case-insensitive, matches partial strings.
 */
export function searchStops(query: string): MtaStop[] {
  const lower = query.toLowerCase().trim()
  if (!lower) return MTA_STOPS

  return MTA_STOPS.filter(s =>
    s.name.toLowerCase().includes(lower) ||
    s.lines.some(l => l.toLowerCase() === lower) ||
    s.stopId.toLowerCase().includes(lower) ||
    s.borough.toLowerCase().includes(lower)
  )
}

/**
 * Get a single stop by its ID.
 */
export function getStopById(id: string): MtaStop | undefined {
  return MTA_STOPS.find(s => s.stopId === id)
}
