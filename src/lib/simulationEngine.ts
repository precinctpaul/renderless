import type { BindingPrimitive } from '../types/scene'

export type SupportedLeague = 'MLB' | 'NBA' | 'NFL' | 'NHL' | 'MLS'
export type SimulationSpeed = 'SLOW' | 'NORMAL' | 'FAST'
type TeamSide = 'home' | 'away'
type NeutralTeam = TeamSide | 'neutral'

interface SimTeam {
  name: string
  abbr: string
}

interface SimPlayer {
  id: string
  team: TeamSide
  name: string
}

interface TeamAccumulator {
  score: number
  penalties: number
  possessions: number
  points: number
  pointsAllowed: number
  attempts: number
  makes: number
  assists: number
  turnovers: number
  rebounds: number
  fouls: number
  epa: number
  successes: number
  plays: number
  dropbacks: number
  pressures: number
  airYards: number
  yardsAfterContact: number
  explosivePlays: number
  defensiveStuffs: number
  atBats: number
  hits: number
  hardHits: number
  barrels: number
  whiffs: number
  chases: number
  spinRateSum: number
  exitVelocitySum: number
  launchAngleSum: number
  xwobaSum: number
  zoneContacts: number
  sprintSpeedSum: number
  pitches: number
  shots: number
  shotsOnTarget: number
  shotAttempts: number
  goals: number
  xg: number
  xga: number
  highDangerChances: number
  corsiFor: number
  corsiAgainst: number
  fenwickFor: number
  fenwickAgainst: number
  saves: number
  takeaways: number
  giveaways: number
  slotShots: number
  zoneStartsOffensive: number
  zoneStartsTotal: number
  passes: number
  progressivePasses: number
  packing: number
  ballRecoveries: number
  pressuresApplied: number
  shotEndingSequences: number
  bigChances: number
  attackingThirdPossession: number
  totalPossessionEvents: number
}

interface PlayerAccumulator {
  id: string
  name: string
  team: TeamSide
  points: number
  assists: number
  rebounds: number
  shots: number
  goals: number
  hits: number
  yards: number
  completions: number
  attempts: number
  hardHits: number
  expectedGoals: number
  recentImpact: number
}

interface MlbContext {
  inning: number
  half: 'top' | 'bottom'
  outs: number
  balls: number
  strikes: number
  bases: {
    first: boolean
    second: boolean
    third: boolean
  }
}

interface NflContext {
  down: number
  distance: number
  yardline: number
}

interface NbaContext {
  shotClock: number
  homeFouls: number
  awayFouls: number
}

interface NhlContext {
  powerPlayTeam: TeamSide | null
  powerPlaySeconds: number
}

interface MlsContext {
  half: 1 | 2
  stoppageTimeSeconds: number
}

interface MutableSimState {
  config: SimulationBuildConfig
  league: SupportedLeague
  gameId: string
  homeTeam: SimTeam
  awayTeam: SimTeam
  roster: Record<TeamSide, SimPlayer[]>
  accumulators: Record<TeamSide, TeamAccumulator>
  playerAccumulators: Record<string, PlayerAccumulator>
  recentEvents: SimulationEvent[]
  period: number
  clockSec: number
  possession: TeamSide
  status: 'pregame' | 'live' | 'final'
  simTimeMs: number
  sequence: number
  unansweredRunTeam: TeamSide | null
  unansweredRunPoints: number
  mlb: MlbContext
  nfl: NflContext
  nba: NbaContext
  nhl: NhlContext
  mls: MlsContext
}

export interface SimulationBuildConfig {
  league: SupportedLeague
  speed: SimulationSpeed
  seed: number
}

export interface SimulationEvent {
  sequence: number
  simTimeMs: number
  clock: string
  eventType: string
  team: NeutralTeam
  player: string
  payload: Record<string, BindingPrimitive>
  summary: string
  intensity: number
  burst: boolean
}

interface SimulationStoryEntry {
  player?: string
  team?: string
  description: string
  probability?: number
  score?: number
}

interface SimulationStory {
  hotStreak: SimulationStoryEntry
  momentumShift: SimulationStoryEntry
  recordWatch: SimulationStoryEntry
  comeback: SimulationStoryEntry
  defense: SimulationStoryEntry
  historicPace: SimulationStoryEntry
  headline: string
}

interface SimulationPlayerSnapshot {
  id: string
  name: string
  team: TeamSide
  points: number
  assists: number
  rebounds: number
  shots: number
  goals: number
  hits: number
  yards: number
  impact: number
}

export interface SimulationSnapshot {
  game: {
    id: string
    league: SupportedLeague
    status: 'PREGAME' | 'LIVE' | 'FINAL'
    clock: {
      display: string
      secondsRemaining: number
    }
    period: number
    possession: TeamSide
    score: {
      home: number
      away: number
    }
  }
  teams: {
    home: SimTeam
    away: SimTeam
  }
  players: {
    home: SimulationPlayerSnapshot[]
    away: SimulationPlayerSnapshot[]
  }
  analytics: {
    game: Record<string, number>
    team: {
      home: Record<string, number>
      away: Record<string, number>
    }
    player: Record<string, Record<string, number>>
  }
  graphics: {
    momentum: {
      home: number
      away: number
    }
    pressure: {
      index: number
    }
    hottestPlayer: {
      name: string
      metric: string
    }
    dominance: {
      home: number
      away: number
    }
    clutch: {
      player: string
      score: number
    }
  }
  story: SimulationStory
  recentEvents: SimulationEvent[]
  context: {
    nfl: NflContext
    mlb: MlbContext
    nba: NbaContext
    nhl: NhlContext
    mls: MlsContext
  }
}

export interface SimulationFrame {
  event: SimulationEvent
  snapshot: SimulationSnapshot
}

export interface SimulationBindingField {
  key: string
  label: string
  group: string
  kind: 'number' | 'string' | 'enum'
}

export interface SimulationTimeline {
  gameId: string
  league: SupportedLeague
  seed: number
  homeTeam: SimTeam
  awayTeam: SimTeam
  frames: SimulationFrame[]
  initialSnapshot: SimulationSnapshot
  bindingFields: SimulationBindingField[]
}

const SPEED_RANGES: Record<SimulationSpeed, { min: number; max: number }> = {
  SLOW: { min: 800, max: 1600 },
  NORMAL: { min: 250, max: 700 },
  FAST: { min: 50, max: 150 },
}

const BURST_RANGES: Record<SimulationSpeed, { min: number; max: number }> = {
  SLOW: { min: 240, max: 620 },
  NORMAL: { min: 80, max: 210 },
  FAST: { min: 35, max: 90 },
}

const EVENT_COUNT_RANGES: Record<SupportedLeague, { min: number; max: number }> = {
  MLB: { min: 800, max: 1500 },
  NBA: { min: 500, max: 900 },
  NFL: { min: 150, max: 250 },
  NHL: { min: 600, max: 1000 },
  MLS: { min: 400, max: 700 },
}

const PERIOD_CLOCK_SECONDS: Record<SupportedLeague, number> = {
  MLB: 0,
  NBA: 12 * 60,
  NFL: 15 * 60,
  NHL: 20 * 60,
  MLS: 45 * 60,
}

const PRIMARY_PERIODS: Record<SupportedLeague, number> = {
  MLB: 9,
  NBA: 4,
  NFL: 4,
  NHL: 3,
  MLS: 2,
}

const TEAM_POOLS: Record<SupportedLeague, SimTeam[]> = {
  NBA: [
    { name: 'Boston Celtics', abbr: 'BOS' },
    { name: 'Los Angeles Lakers', abbr: 'LAL' },
    { name: 'Denver Nuggets', abbr: 'DEN' },
    { name: 'Golden State Warriors', abbr: 'GSW' },
    { name: 'Milwaukee Bucks', abbr: 'MIL' },
    { name: 'Miami Heat', abbr: 'MIA' },
  ],
  NFL: [
    { name: 'Kansas City Chiefs', abbr: 'KC' },
    { name: 'San Francisco 49ers', abbr: 'SF' },
    { name: 'Dallas Cowboys', abbr: 'DAL' },
    { name: 'Philadelphia Eagles', abbr: 'PHI' },
    { name: 'Buffalo Bills', abbr: 'BUF' },
    { name: 'Baltimore Ravens', abbr: 'BAL' },
  ],
  MLB: [
    { name: 'New York Yankees', abbr: 'NYY' },
    { name: 'Los Angeles Dodgers', abbr: 'LAD' },
    { name: 'Atlanta Braves', abbr: 'ATL' },
    { name: 'Houston Astros', abbr: 'HOU' },
    { name: 'Boston Red Sox', abbr: 'BOS' },
    { name: 'Seattle Mariners', abbr: 'SEA' },
  ],
  NHL: [
    { name: 'New York Rangers', abbr: 'NYR' },
    { name: 'Toronto Maple Leafs', abbr: 'TOR' },
    { name: 'Colorado Avalanche', abbr: 'COL' },
    { name: 'Vegas Golden Knights', abbr: 'VGK' },
    { name: 'Edmonton Oilers', abbr: 'EDM' },
    { name: 'Tampa Bay Lightning', abbr: 'TBL' },
  ],
  MLS: [
    { name: 'Inter Miami', abbr: 'MIA' },
    { name: 'LAFC', abbr: 'LAFC' },
    { name: 'Seattle Sounders', abbr: 'SEA' },
    { name: 'Atlanta United', abbr: 'ATL' },
    { name: 'Philadelphia Union', abbr: 'PHI' },
    { name: 'Portland Timbers', abbr: 'POR' },
  ],
}

const REAL_PLAYER_POOLS: Record<SupportedLeague, string[]> = {
  NBA: [
    'LeBron James',
    'Stephen Curry',
    'Kevin Durant',
    'Giannis Antetokounmpo',
    'Nikola Jokic',
    'Jayson Tatum',
    'Luka Doncic',
    'Shai Gilgeous-Alexander',
    'Joel Embiid',
    'Devin Booker',
    'Anthony Davis',
    'Jaylen Brown',
    'Damian Lillard',
    'Donovan Mitchell',
    'Ja Morant',
    'Tyrese Haliburton',
    'Jalen Brunson',
    'Jimmy Butler',
    'Bam Adebayo',
    'Kawhi Leonard',
    'Paul George',
    'Jamal Murray',
    'Kyrie Irving',
    'Trae Young',
    'Anthony Edwards',
    'Karl-Anthony Towns',
    'Domantas Sabonis',
    'DeMar DeRozan',
    'Cade Cunningham',
    'Victor Wembanyama',
    'Mikal Bridges',
    'Jrue Holiday',
    'Rudy Gobert',
    'Tyrese Maxey',
    'Zion Williamson',
    'Pascal Siakam',
    'Derrick White',
    'Austin Reaves',
    'Darius Garland',
    'Kristaps Porzingis',
  ],
  NFL: [
    'Patrick Mahomes',
    'Josh Allen',
    'Lamar Jackson',
    'Joe Burrow',
    'Jalen Hurts',
    'Dak Prescott',
    'Brock Purdy',
    'Justin Herbert',
    'Tua Tagovailoa',
    'Aaron Rodgers',
    'Trevor Lawrence',
    'C.J. Stroud',
    'Justin Jefferson',
    'Tyreek Hill',
    'Stefon Diggs',
    'CeeDee Lamb',
    'A.J. Brown',
    'Amon-Ra St. Brown',
    'JaMarr Chase',
    'Travis Kelce',
    'George Kittle',
    'Mark Andrews',
    'Christian McCaffrey',
    'Saquon Barkley',
    'Derrick Henry',
    'Nick Chubb',
    'Bijan Robinson',
    'Breece Hall',
    'Puka Nacua',
    'Deebo Samuel',
    'Micah Parsons',
    'T.J. Watt',
    'Myles Garrett',
    'Nick Bosa',
    'Roquan Smith',
    'Fred Warner',
    'Maxx Crosby',
    'Jaire Alexander',
    'Sauce Gardner',
    'Chris Jones',
    'Trent McDuffie',
    'Jordan Love',
  ],
  MLB: [
    'Aaron Judge',
    'Mookie Betts',
    'Shohei Ohtani',
    'Freddie Freeman',
    'Ronald Acuna Jr.',
    'Juan Soto',
    'Yordan Alvarez',
    'Jose Ramirez',
    'Bobby Witt Jr.',
    'Corey Seager',
    'Adley Rutschman',
    'Julio Rodriguez',
    'Vladimir Guerrero Jr.',
    'Kyle Tucker',
    'Matt Olson',
    'Francisco Lindor',
    'Trea Turner',
    'Corbin Carroll',
    'Austin Riley',
    'Manny Machado',
    'Fernando Tatis Jr.',
    'Bryce Harper',
    'Gerrit Cole',
    'Zack Wheeler',
    'Corbin Burnes',
    'Spencer Strider',
    'Max Fried',
    'Logan Webb',
    'Pablo Lopez',
    'Luis Castillo',
    'Rafael Devers',
    'Bo Bichette',
    'Ozzie Albies',
    'Pete Alonso',
    'Xander Bogaerts',
    'Nolan Arenado',
  ],
  NHL: [
    'Connor McDavid',
    'Leon Draisaitl',
    'Nathan MacKinnon',
    'Auston Matthews',
    'Mitch Marner',
    'David Pastrnak',
    'Artemi Panarin',
    'Mikko Rantanen',
    'Cale Makar',
    'Roman Josi',
    'Aleksander Barkov',
    'Nikita Kucherov',
    'Brayden Point',
    'Steven Stamkos',
    'Jack Eichel',
    'Mark Stone',
    'Sidney Crosby',
    'Evgeni Malkin',
    'Kirill Kaprizov',
    'Jason Robertson',
    'Jake Oettinger',
    'Igor Shesterkin',
    'Andrei Vasilevskiy',
    'Ilya Sorokin',
    'Mika Zibanejad',
    'Adam Fox',
    'Sebastian Aho',
    'Mathew Barzal',
    'Elias Pettersson',
    'Quinn Hughes',
    'Anze Kopitar',
    'Adrian Kempe',
    'Brady Tkachuk',
    'Tim Stutzle',
  ],
  MLS: [
    'Lionel Messi',
    'Luis Suarez',
    'Sergio Busquets',
    'Jordi Alba',
    'Giorgio Chiellini',
    'Denis Bouanga',
    'Carlos Vela',
    'Cristian Arango',
    'Hany Mukhtar',
    'Luciano Acosta',
    'Thiago Almada',
    'Riqui Puig',
    'Djordje Mihailovic',
    'Cucho Hernandez',
    'Diego Rossi',
    'Josef Martinez',
    'Jordan Morris',
    'Nicolas Lodeiro',
    'Ryan Gauld',
    'Carles Gil',
    'Dani Pereira',
    'Sebastian Driussi',
    'Walker Zimmerman',
    'Tim Parker',
    'Jesus Ferreira',
    'Brandon Vazquez',
    'Facundo Torres',
    'Gaston Brugman',
    'Cristian Espinoza',
    'Emil Forsberg',
    'Pedro de la Vega',
    'Evander',
  ],
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toFixedNumber(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function createRng(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function randFloat(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min
}

function pickOne<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] as T
}

function pickWeighted<T>(rng: () => number, values: Array<{ value: T; weight: number }>): T {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0)
  const roll = rng() * totalWeight
  let cursor = 0
  for (const entry of values) {
    cursor += entry.weight
    if (roll <= cursor) {
      return entry.value
    }
  }

  return values[values.length - 1]!.value
}

function humanizeSegment(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase())
}

function makeBindingLabel(key: string): string {
  return key
    .split('.')
    .map((segment) => humanizeSegment(segment))
    .join(' > ')
}

function generateRoster(league: SupportedLeague, team: TeamSide, rng: () => number): SimPlayer[] {
  const rosterSize = league === 'NFL' ? 18 : league === 'MLB' ? 16 : 14
  const pool = REAL_PLAYER_POOLS[league]
  const startOffset = randInt(rng, 0, Math.max(0, pool.length - 1))
  return Array.from({ length: rosterSize }, (_, index) => ({
    id: `${team}-p-${index + 1}`,
    team,
    name: pool[(startOffset + index) % pool.length]!,
  }))
}

function emptyTeamAccumulator(): TeamAccumulator {
  return {
    score: 0,
    penalties: 0,
    possessions: 0,
    points: 0,
    pointsAllowed: 0,
    attempts: 0,
    makes: 0,
    assists: 0,
    turnovers: 0,
    rebounds: 0,
    fouls: 0,
    epa: 0,
    successes: 0,
    plays: 0,
    dropbacks: 0,
    pressures: 0,
    airYards: 0,
    yardsAfterContact: 0,
    explosivePlays: 0,
    defensiveStuffs: 0,
    atBats: 0,
    hits: 0,
    hardHits: 0,
    barrels: 0,
    whiffs: 0,
    chases: 0,
    spinRateSum: 0,
    exitVelocitySum: 0,
    launchAngleSum: 0,
    xwobaSum: 0,
    zoneContacts: 0,
    sprintSpeedSum: 0,
    pitches: 0,
    shots: 0,
    shotsOnTarget: 0,
    shotAttempts: 0,
    goals: 0,
    xg: 0,
    xga: 0,
    highDangerChances: 0,
    corsiFor: 0,
    corsiAgainst: 0,
    fenwickFor: 0,
    fenwickAgainst: 0,
    saves: 0,
    takeaways: 0,
    giveaways: 0,
    slotShots: 0,
    zoneStartsOffensive: 0,
    zoneStartsTotal: 0,
    passes: 0,
    progressivePasses: 0,
    packing: 0,
    ballRecoveries: 0,
    pressuresApplied: 0,
    shotEndingSequences: 0,
    bigChances: 0,
    attackingThirdPossession: 0,
    totalPossessionEvents: 0,
  }
}
function initState(config: SimulationBuildConfig): MutableSimState {
  const seed = Number.isFinite(config.seed) ? Math.max(1, Math.floor(config.seed)) : 1
  const rng = createRng(seed)
  const teams = TEAM_POOLS[config.league]
  const homeTeam = pickOne(rng, teams)
  let awayTeam = pickOne(rng, teams)
  while (awayTeam.abbr === homeTeam.abbr) {
    awayTeam = pickOne(rng, teams)
  }

  const homeRoster = generateRoster(config.league, 'home', rng)
  const awayRoster = generateRoster(config.league, 'away', rng)
  const playerAccumulators: Record<string, PlayerAccumulator> = {}
  ;[...homeRoster, ...awayRoster].forEach((player) => {
    playerAccumulators[player.id] = {
      id: player.id,
      name: player.name,
      team: player.team,
      points: 0,
      assists: 0,
      rebounds: 0,
      shots: 0,
      goals: 0,
      hits: 0,
      yards: 0,
      completions: 0,
      attempts: 0,
      hardHits: 0,
      expectedGoals: 0,
      recentImpact: 0,
    }
  })

  return {
    config: { ...config, seed },
    league: config.league,
    gameId: `sim-${config.league.toLowerCase()}-${seed}`,
    homeTeam,
    awayTeam,
    roster: { home: homeRoster, away: awayRoster },
    accumulators: {
      home: emptyTeamAccumulator(),
      away: emptyTeamAccumulator(),
    },
    playerAccumulators,
    recentEvents: [],
    period: 1,
    clockSec: PERIOD_CLOCK_SECONDS[config.league],
    possession: rng() > 0.5 ? 'home' : 'away',
    status: 'pregame',
    simTimeMs: 0,
    sequence: 0,
    unansweredRunTeam: null,
    unansweredRunPoints: 0,
    mlb: {
      inning: 1,
      half: 'top',
      outs: 0,
      balls: 0,
      strikes: 0,
      bases: { first: false, second: false, third: false },
    },
    nfl: {
      down: 1,
      distance: 10,
      yardline: 25,
    },
    nba: {
      shotClock: 24,
      homeFouls: 0,
      awayFouls: 0,
    },
    nhl: {
      powerPlayTeam: null,
      powerPlaySeconds: 0,
    },
    mls: {
      half: 1,
      stoppageTimeSeconds: randInt(rng, 120, 420),
    },
  }
}

function otherTeam(team: TeamSide): TeamSide {
  return team === 'home' ? 'away' : 'home'
}

function formatClock(state: MutableSimState): string {
  if (state.league === 'MLB') {
    return `${state.mlb.half === 'top' ? 'Top' : 'Bot'} ${state.mlb.inning}`
  }

  const minutes = Math.floor(state.clockSec / 60)
  const seconds = Math.max(0, state.clockSec % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getClockStepRange(league: SupportedLeague): { min: number; max: number } {
  switch (league) {
    case 'NBA':
      return { min: 3, max: 24 }
    case 'NFL':
      return { min: 5, max: 35 }
    case 'NHL':
      return { min: 2, max: 15 }
    case 'MLS':
      return { min: 4, max: 20 }
    case 'MLB':
      return { min: 0, max: 0 }
  }
}

function advanceClock(state: MutableSimState, rng: () => number) {
  if (state.league === 'MLB') {
    return
  }

  state.status = 'live'
  const stepRange = getClockStepRange(state.league)
  state.clockSec = Math.max(0, state.clockSec - randInt(rng, stepRange.min, stepRange.max))

  if (state.nhl.powerPlaySeconds > 0) {
    state.nhl.powerPlaySeconds = Math.max(0, state.nhl.powerPlaySeconds - randInt(rng, 4, 18))
    if (state.nhl.powerPlaySeconds === 0) {
      state.nhl.powerPlayTeam = null
    }
  }

  if (state.clockSec > 0) {
    return
  }

  const basePeriodLimit = PRIMARY_PERIODS[state.league]
  const overtimeClock = state.league === 'NBA' ? 300 : state.league === 'NFL' ? 600 : state.league === 'NHL' ? 300 : 300

  if (state.period < basePeriodLimit) {
    state.period += 1
    state.clockSec = PERIOD_CLOCK_SECONDS[state.league]
    if (state.league === 'MLS') {
      state.mls.half = state.period >= 2 ? 2 : 1
      if (state.period === 2) {
        state.clockSec += state.mls.stoppageTimeSeconds
      }
    }
    return
  }

  state.period += 1
  state.clockSec = overtimeClock
}

function registerScore(state: MutableSimState, team: TeamSide, points: number) {
  if (points <= 0) {
    return
  }

  const defender = otherTeam(team)
  state.accumulators[team].score += points
  state.accumulators[team].points += points
  state.accumulators[defender].pointsAllowed += points

  if (state.unansweredRunTeam === team) {
    state.unansweredRunPoints += points
  } else {
    state.unansweredRunTeam = team
    state.unansweredRunPoints = points
  }
}

function registerRecentEvent(state: MutableSimState, event: SimulationEvent) {
  state.recentEvents = [...state.recentEvents, event].slice(-12)

  Object.values(state.playerAccumulators).forEach((player) => {
    player.recentImpact *= 0.92
  })

  if (event.team === 'home' || event.team === 'away') {
    state.accumulators[event.team].totalPossessionEvents += 1
    state.accumulators[event.team].possessions += 1
  }
}

function updatePlayerImpact(state: MutableSimState, playerId: string, delta: number) {
  const player = state.playerAccumulators[playerId]
  if (!player) {
    return
  }

  player.recentImpact = clamp(player.recentImpact + delta, 0, 180)
}

function selectPlayer(state: MutableSimState, team: TeamSide, rng: () => number): SimPlayer {
  return pickOne(rng, state.roster[team])
}

function applyNbaEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  const offensiveTeam = state.possession
  const defensiveTeam = otherTeam(offensiveTeam)
  const shooter = selectPlayer(state, offensiveTeam, rng)
  const eventType = pickWeighted(rng, [
    { value: 'shot attempt', weight: 34 },
    { value: 'rebound', weight: 18 },
    { value: 'assist', weight: 11 },
    { value: 'turnover', weight: 12 },
    { value: 'foul', weight: 14 },
    { value: 'timeout', weight: 4 },
    { value: 'substitution', weight: 7 },
  ])

  let summary = ''
  let intensity = 10
  let burst = false
  const payload: Record<string, BindingPrimitive> = {}

  if (eventType === 'shot attempt') {
    const isThree = rng() < 0.36
    const made = rng() < (isThree ? 0.38 : 0.51)
    const points = made ? (isThree ? 3 : 2) : 0
    state.accumulators[offensiveTeam].attempts += 1
    state.accumulators[offensiveTeam].shotAttempts += 1
    state.playerAccumulators[shooter.id]!.shots += 1

    if (made) {
      state.accumulators[offensiveTeam].makes += 1
      state.playerAccumulators[shooter.id]!.points += points
      registerScore(state, offensiveTeam, points)
      summary = `${shooter.name} hits a ${isThree ? '3' : '2'} from the ${pickOne(rng, ['right wing', 'left corner', 'elbow'])}`
      intensity = 18 + points * 8
      burst = rng() < 0.42
      state.possession = defensiveTeam
      state.nba.shotClock = 24
      if (rng() < 0.66) {
        const assister = selectPlayer(state, offensiveTeam, rng)
        state.playerAccumulators[assister.id]!.assists += 1
        state.accumulators[offensiveTeam].assists += 1
        payload.assister = assister.name
      }
      updatePlayerImpact(state, shooter.id, points * 10)
    } else {
      summary = `${shooter.name} misses from ${pickOne(rng, ['mid-range', 'the arc', 'the baseline'])}`
      intensity = 9
      state.nba.shotClock = randInt(rng, 10, 24)
      if (rng() < 0.72) {
        state.possession = defensiveTeam
      } else {
        burst = true
      }
      updatePlayerImpact(state, shooter.id, 2)
    }

    payload.made = made
    payload.points = points
    payload.shotValue = isThree ? 3 : 2
  } else if (eventType === 'rebound') {
    const offensiveBoard = rng() < 0.28
    const rebTeam = offensiveBoard ? offensiveTeam : defensiveTeam
    const rebounder = selectPlayer(state, rebTeam, rng)
    state.accumulators[rebTeam].rebounds += 1
    state.playerAccumulators[rebounder.id]!.rebounds += 1
    summary = `${rebounder.name} pulls down the ${offensiveBoard ? 'offensive' : 'defensive'} rebound`
    state.possession = offensiveBoard ? offensiveTeam : defensiveTeam
    state.nba.shotClock = offensiveBoard ? 14 : 24
    intensity = offensiveBoard ? 13 : 8
    burst = offensiveBoard
    payload.offensive = offensiveBoard
    updatePlayerImpact(state, rebounder.id, offensiveBoard ? 7 : 4)
  } else if (eventType === 'assist') {
    const passer = selectPlayer(state, offensiveTeam, rng)
    state.accumulators[offensiveTeam].assists += 1
    state.playerAccumulators[passer.id]!.assists += 1
    summary = `${passer.name} threads the assist in transition`
    intensity = 11
    burst = true
    updatePlayerImpact(state, passer.id, 6)
  } else if (eventType === 'turnover') {
    const culprit = selectPlayer(state, offensiveTeam, rng)
    state.accumulators[offensiveTeam].turnovers += 1
    state.possession = defensiveTeam
    state.nba.shotClock = 24
    summary = `${culprit.name} turns it over under pressure`
    intensity = 10
    payload.liveBall = rng() < 0.45
    updatePlayerImpact(state, culprit.id, 1)
  } else if (eventType === 'foul') {
    const foulOnTeam = rng() < 0.5 ? offensiveTeam : defensiveTeam
    if (foulOnTeam === 'home') {
      state.nba.homeFouls += 1
    } else {
      state.nba.awayFouls += 1
    }
    state.accumulators[foulOnTeam].fouls += 1
    summary = `${state[foulOnTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} commits a reaching foul`
    intensity = 8
    payload.teamFouls = foulOnTeam === 'home' ? state.nba.homeFouls : state.nba.awayFouls
  } else if (eventType === 'timeout') {
    summary = `${state[offensiveTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} calls timeout`
    intensity = 6
  } else {
    summary = `${state[offensiveTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} subs in fresh legs`
    intensity = 5
  }

  return {
    eventType,
    team: eventType === 'timeout' || eventType === 'substitution' ? 'neutral' : offensiveTeam,
    player: shooter.name,
    payload,
    summary,
    intensity,
    burst,
  }
}
function applyNflEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  const offense = state.possession
  const defense = otherTeam(offense)
  const qb = selectPlayer(state, offense, rng)
  const runner = selectPlayer(state, offense, rng)
  const receiver = selectPlayer(state, offense, rng)
  const eventType = pickWeighted(rng, [
    { value: 'snap', weight: 12 },
    { value: 'run attempt', weight: 21 },
    { value: 'pass attempt', weight: 28 },
    { value: 'tackle', weight: 11 },
    { value: 'penalty', weight: 8 },
    { value: 'field goal', weight: 7 },
    { value: 'punt', weight: 13 },
  ])

  const payload: Record<string, BindingPrimitive> = {}
  let summary = ''
  let intensity = 9
  let burst = false

  const offenseAcc = state.accumulators[offense]
  const defenseAcc = state.accumulators[defense]
  offenseAcc.plays += 1
  defenseAcc.plays += 1

  if (eventType === 'snap') {
    summary = `${qb.name} takes the snap`
    intensity = 6
    burst = true
  } else if (eventType === 'run attempt') {
    const gain = randInt(rng, -2, 18)
    const success = gain >= Math.max(3, Math.ceil(state.nfl.distance * 0.4))
    offenseAcc.yardsAfterContact += Math.max(0, randInt(rng, 0, Math.max(0, gain)))
    offenseAcc.epa += toFixedNumber(gain / 8, 2)
    offenseAcc.successes += success ? 1 : 0
    offenseAcc.plays += 1
    defenseAcc.defensiveStuffs += gain <= 0 ? 1 : 0
    state.playerAccumulators[runner.id]!.yards += Math.max(0, gain)
    state.playerAccumulators[runner.id]!.attempts += 1
    summary = `${runner.name} runs for ${gain >= 0 ? gain : 0} yards`
    intensity = 10 + (success ? 6 : 0)
    payload.gain = gain
    payload.success = success
    state.nfl.yardline = clamp(state.nfl.yardline + gain, 1, 99)
    state.nfl.distance -= gain
    if (state.nfl.yardline >= 99) {
      registerScore(state, offense, 7)
      state.nfl = { down: 1, distance: 10, yardline: 25 }
      state.possession = defense
      summary = `${runner.name} punches it in for a rushing touchdown`
      intensity = 24
    } else if (state.nfl.distance <= 0) {
      state.nfl.down = 1
      state.nfl.distance = 10
    } else {
      state.nfl.down += 1
    }
  } else if (eventType === 'pass attempt') {
    const completed = rng() < 0.64
    const airYards = randInt(rng, 3, 28)
    const yac = completed ? randInt(rng, 0, 18) : 0
    const gain = completed ? airYards + yac : 0
    const epa = completed ? toFixedNumber(gain / 10, 2) : toFixedNumber(-0.8, 2)
    offenseAcc.dropbacks += 1
    offenseAcc.airYards += airYards
    offenseAcc.yardsAfterContact += yac
    offenseAcc.epa += epa
    offenseAcc.successes += epa > 0 ? 1 : 0
    offenseAcc.pressures += rng() < 0.35 ? 1 : 0
    offenseAcc.explosivePlays += gain >= 20 ? 1 : 0
    state.playerAccumulators[qb.id]!.attempts += 1
    state.playerAccumulators[receiver.id]!.attempts += 1
    if (completed) {
      state.playerAccumulators[qb.id]!.completions += 1
      state.playerAccumulators[qb.id]!.yards += gain
      state.playerAccumulators[receiver.id]!.completions += 1
      state.playerAccumulators[receiver.id]!.yards += gain
      updatePlayerImpact(state, receiver.id, 6 + Math.min(12, gain / 2))
      summary = `${qb.name} connects with ${receiver.name} for ${gain} yards`
      state.nfl.yardline = clamp(state.nfl.yardline + gain, 1, 99)
      state.nfl.distance -= gain
      burst = gain >= 14
      intensity = 12 + Math.min(12, Math.floor(gain / 3))
      if (state.nfl.yardline >= 99) {
        registerScore(state, offense, 7)
        state.nfl = { down: 1, distance: 10, yardline: 25 }
        state.possession = defense
        summary = `${qb.name} finds ${receiver.name} for the touchdown`
        intensity = 26
      } else if (state.nfl.distance <= 0) {
        state.nfl.down = 1
        state.nfl.distance = 10
      } else {
        state.nfl.down += 1
      }
    } else {
      summary = `${qb.name} throws incomplete under pressure`
      state.nfl.down += 1
      intensity = 8
      updatePlayerImpact(state, qb.id, 2)
    }

    payload.completed = completed
    payload.airYards = airYards
    payload.yardsAfterCatch = yac
  } else if (eventType === 'tackle') {
    const defender = selectPlayer(state, defense, rng)
    defenseAcc.takeaways += 1
    summary = `${defender.name} makes the stop at the ${state.nfl.yardline}`
    intensity = 7
    burst = true
  } else if (eventType === 'penalty') {
    const yards = pickOne(rng, [5, 10, 15])
    const onOffense = rng() < 0.52
    if (onOffense) {
      state.nfl.yardline = clamp(state.nfl.yardline - yards, 1, 99)
      state.nfl.distance += yards
      summary = `${state[offense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} flagged for ${yards} yards`
    } else {
      state.nfl.yardline = clamp(state.nfl.yardline + yards, 1, 99)
      state.nfl.distance = Math.max(1, state.nfl.distance - yards)
      summary = `${state[defense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} gives up ${yards} yards on penalty`
    }
    intensity = 8
    payload.yards = yards
    payload.onOffense = onOffense
  } else if (eventType === 'field goal') {
    const distance = randInt(rng, 32, 58)
    const made = rng() < clamp(0.86 - (distance - 32) * 0.015, 0.28, 0.9)
    if (made) {
      registerScore(state, offense, 3)
      summary = `${state[offense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} drills a ${distance}-yard field goal`
      intensity = 16
      updatePlayerImpact(state, qb.id, 5)
    } else {
      summary = `${state[offense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} misses from ${distance} yards`
      intensity = 11
    }
    payload.distance = distance
    payload.made = made
    state.nfl = { down: 1, distance: 10, yardline: 25 }
    state.possession = defense
  } else {
    const netYards = randInt(rng, 34, 54)
    state.nfl.yardline = clamp(100 - netYards, 20, 80)
    state.nfl.down = 1
    state.nfl.distance = 10
    state.possession = defense
    summary = `${state[offense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} punts for ${netYards} net yards`
    intensity = 7
    payload.netYards = netYards
  }

  if (state.nfl.down > 4) {
    state.possession = defense
    state.nfl.down = 1
    state.nfl.distance = 10
    state.nfl.yardline = clamp(100 - state.nfl.yardline, 20, 80)
    summary = `${state[defense === 'home' ? 'homeTeam' : 'awayTeam'].abbr} takes over on downs`
    intensity = 12
  }

  return {
    eventType,
    team: offense,
    player: qb.name,
    payload: {
      ...payload,
      down: state.nfl.down,
      distance: state.nfl.distance,
      yardline: state.nfl.yardline,
    },
    summary,
    intensity,
    burst,
  }
}

function advanceMlbBases(state: MutableSimState, battingTeam: TeamSide, basesEarned: number): number {
  const bases = { ...state.mlb.bases }
  let runs = 0

  if (bases.third) {
    runs += 1
  }
  bases.third = bases.second
  bases.second = bases.first
  bases.first = true

  if (basesEarned >= 2) {
    if (bases.third) runs += 1
    bases.third = bases.second
    bases.second = true
  }
  if (basesEarned >= 3) {
    if (bases.third) runs += 1
    bases.third = true
  }
  if (basesEarned >= 4) {
    runs += Number(bases.first) + Number(bases.second) + Number(bases.third)
    bases.first = false
    bases.second = false
    bases.third = false
  }

  state.mlb.bases = bases
  if (runs > 0) {
    registerScore(state, battingTeam, runs)
  }
  return runs
}

function applyMlbEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  const battingTeam: TeamSide = state.mlb.half === 'top' ? 'away' : 'home'
  const fieldingTeam = otherTeam(battingTeam)
  const batter = selectPlayer(state, battingTeam, rng)
  const pitcher = selectPlayer(state, fieldingTeam, rng)
  const eventType = pickWeighted(rng, [
    { value: 'pitch', weight: 20 },
    { value: 'ball', weight: 11 },
    { value: 'strike', weight: 12 },
    { value: 'swing', weight: 13 },
    { value: 'batted ball', weight: 21 },
    { value: 'base advance', weight: 6 },
    { value: 'out', weight: 17 },
  ])

  const offenseAcc = state.accumulators[battingTeam]
  const defenseAcc = state.accumulators[fieldingTeam]
  let summary = ''
  let intensity = 7
  let burst = false
  const payload: Record<string, BindingPrimitive> = {}

  offenseAcc.atBats += 1
  offenseAcc.pitches += 1
  defenseAcc.pitches += 1

  if (eventType === 'pitch') {
    const spinRate = randInt(rng, 1800, 2800)
    offenseAcc.spinRateSum += spinRate
    summary = `${pitcher.name} fires ${spinRate} rpm to ${batter.name}`
    intensity = 5
    payload.spinRate = spinRate
  } else if (eventType === 'ball') {
    state.mlb.balls += 1
    summary = `${pitcher.name} misses outside, ball ${state.mlb.balls}`
    intensity = 4
    if (state.mlb.balls >= 4) {
      state.mlb.balls = 0
      state.mlb.strikes = 0
      const runs = advanceMlbBases(state, battingTeam, 1)
      summary = `${batter.name} draws a walk${runs > 0 ? ', run scores' : ''}`
      intensity = 10
      burst = runs > 0
    }
  } else if (eventType === 'strike') {
    state.mlb.strikes += 1
    summary = `${pitcher.name} catches the zone, strike ${state.mlb.strikes}`
    intensity = 5
    if (state.mlb.strikes >= 3) {
      state.mlb.outs += 1
      state.mlb.balls = 0
      state.mlb.strikes = 0
      summary = `${batter.name} goes down swinging`
      intensity = 9
      offenseAcc.whiffs += 1
    }
  } else if (eventType === 'swing') {
    const contact = rng() < 0.56
    const chase = rng() < 0.33
    offenseAcc.chases += chase ? 1 : 0
    if (contact) {
      offenseAcc.zoneContacts += 1
      summary = `${batter.name} puts a swing on the pitch`
      intensity = 6
    } else {
      offenseAcc.whiffs += 1
      summary = `${batter.name} swings through it`
      intensity = 8
    }
    payload.contact = contact
    payload.chase = chase
  } else if (eventType === 'batted ball') {
    const exitVelocity = randInt(rng, 60, 115)
    const launchAngle = randInt(rng, -20, 50)
    const hitType = pickWeighted(rng, [
      { value: 'single', weight: 58 },
      { value: 'double', weight: 22 },
      { value: 'triple', weight: 4 },
      { value: 'home run', weight: 16 },
    ])
    const isHit = rng() < 0.66
    offenseAcc.exitVelocitySum += exitVelocity
    offenseAcc.launchAngleSum += launchAngle
    offenseAcc.xwobaSum += clamp(0.08 + (exitVelocity - 60) / 100 + (launchAngle + 20) / 160, 0.05, 0.95)
    offenseAcc.sprintSpeedSum += randFloat(rng, 24, 31)
    offenseAcc.hardHits += exitVelocity >= 95 ? 1 : 0
    offenseAcc.barrels += exitVelocity >= 98 && launchAngle >= 20 && launchAngle <= 35 ? 1 : 0
    offenseAcc.atBats += 1
    state.playerAccumulators[batter.id]!.hardHits += exitVelocity >= 95 ? 1 : 0
    state.playerAccumulators[batter.id]!.hits += isHit ? 1 : 0

    if (isHit) {
      const basesEarned = hitType === 'single' ? 1 : hitType === 'double' ? 2 : hitType === 'triple' ? 3 : 4
      const runs = advanceMlbBases(state, battingTeam, basesEarned)
      offenseAcc.hits += 1
      state.mlb.balls = 0
      state.mlb.strikes = 0
      summary = `${batter.name} rips a ${hitType}${runs > 0 ? `, ${runs} run${runs === 1 ? '' : 's'} score` : ''}`
      intensity = hitType === 'home run' ? 22 : 13
      burst = hitType !== 'single'
      updatePlayerImpact(state, batter.id, hitType === 'home run' ? 20 : 8)
    } else {
      state.mlb.outs += 1
      summary = `${batter.name} lines out to ${pickOne(rng, ['left', 'center', 'right'])}`
      intensity = 7
      offenseAcc.whiffs += 1
    }

    payload.exitVelocity = exitVelocity
    payload.launchAngle = launchAngle
    payload.result = isHit ? hitType : 'out'
  } else if (eventType === 'base advance') {
    const runs = advanceMlbBases(state, battingTeam, 1)
    summary = `${state[battingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} manufactures a base advance${runs > 0 ? ', run scores' : ''}`
    intensity = 11
    burst = true
  } else {
    state.mlb.outs += 1
    state.mlb.balls = 0
    state.mlb.strikes = 0
    summary = `${batter.name} retired for out number ${state.mlb.outs}`
    intensity = 8
  }

  if (state.mlb.outs >= 3) {
    state.mlb.outs = 0
    state.mlb.balls = 0
    state.mlb.strikes = 0
    state.mlb.bases = { first: false, second: false, third: false }
    if (state.mlb.half === 'top') {
      state.mlb.half = 'bottom'
    } else {
      state.mlb.half = 'top'
      state.mlb.inning += 1
      state.period = state.mlb.inning
    }
    state.possession = state.mlb.half === 'top' ? 'away' : 'home'
  } else {
    state.possession = battingTeam
  }

  return {
    eventType,
    team: battingTeam,
    player: batter.name,
    payload: {
      ...payload,
      inning: state.mlb.inning,
      half: state.mlb.half,
      outs: state.mlb.outs,
      first: state.mlb.bases.first,
      second: state.mlb.bases.second,
      third: state.mlb.bases.third,
    },
    summary,
    intensity,
    burst,
  }
}
function applyNhlEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  const attackingTeam = state.possession
  const defendingTeam = otherTeam(attackingTeam)
  const shooter = selectPlayer(state, attackingTeam, rng)
  const goalie = selectPlayer(state, defendingTeam, rng)
  const eventType = pickWeighted(rng, [
    { value: 'faceoff', weight: 10 },
    { value: 'shot attempt', weight: 38 },
    { value: 'save', weight: 18 },
    { value: 'goal', weight: 12 },
    { value: 'penalty', weight: 12 },
    { value: 'takeaway', weight: 10 },
  ])

  const payload: Record<string, BindingPrimitive> = {}
  let summary = ''
  let intensity = 9
  let burst = false

  state.accumulators[attackingTeam].corsiFor += 1
  state.accumulators[defendingTeam].corsiAgainst += 1
  state.accumulators[attackingTeam].fenwickFor += 1
  state.accumulators[defendingTeam].fenwickAgainst += 1
  state.accumulators[attackingTeam].shots += 1
  state.accumulators[attackingTeam].shotAttempts += 1
  state.accumulators[attackingTeam].xg += randFloat(rng, 0.02, 0.36)
  state.accumulators[defendingTeam].xga += randFloat(rng, 0.02, 0.36)

  if (eventType === 'faceoff') {
    state.possession = rng() < 0.5 ? 'home' : 'away'
    summary = `${state[state.possession === 'home' ? 'homeTeam' : 'awayTeam'].abbr} win the draw`
    intensity = 6
    burst = true
    payload.zone = pickOne(rng, ['offensive', 'neutral', 'defensive'])
  } else if (eventType === 'shot attempt') {
    const slotShot = rng() < 0.28
    const highDanger = slotShot || rng() < 0.2
    state.accumulators[attackingTeam].slotShots += slotShot ? 1 : 0
    state.accumulators[attackingTeam].highDangerChances += highDanger ? 1 : 0
    summary = `${shooter.name} fires from the ${highDanger ? 'slot' : 'perimeter'}`
    intensity = highDanger ? 15 : 10
    burst = true
    payload.highDanger = highDanger
  } else if (eventType === 'save') {
    state.accumulators[defendingTeam].saves += 1
    summary = `${goalie.name} makes the save on ${shooter.name}`
    intensity = 11
    payload.save = true
    state.possession = defendingTeam
  } else if (eventType === 'goal') {
    state.accumulators[attackingTeam].goals += 1
    state.accumulators[attackingTeam].shotsOnTarget += 1
    state.playerAccumulators[shooter.id]!.goals += 1
    registerScore(state, attackingTeam, 1)
    summary = `${shooter.name} scores, lamp is lit for ${state[attackingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr}`
    intensity = 25
    burst = true
    state.possession = defendingTeam
    updatePlayerImpact(state, shooter.id, 18)
  } else if (eventType === 'penalty') {
    state.accumulators[defendingTeam].penalties += 1
    state.nhl.powerPlayTeam = attackingTeam
    state.nhl.powerPlaySeconds = randInt(rng, 80, 120)
    summary = `${state[defendingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} takes a penalty, power play`
    intensity = 12
    payload.powerPlayTeam = attackingTeam.toUpperCase()
  } else {
    state.accumulators[attackingTeam].takeaways += 1
    state.accumulators[defendingTeam].giveaways += 1
    summary = `${shooter.name} strips the puck and starts transition`
    intensity = 10
    burst = true
  }

  return {
    eventType,
    team: attackingTeam,
    player: shooter.name,
    payload,
    summary,
    intensity,
    burst,
  }
}

function applyMlsEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  const attackingTeam = state.possession
  const defendingTeam = otherTeam(attackingTeam)
  const attacker = selectPlayer(state, attackingTeam, rng)
  const eventType = pickWeighted(rng, [
    { value: 'pass', weight: 38 },
    { value: 'shot', weight: 19 },
    { value: 'foul', weight: 13 },
    { value: 'tackle', weight: 14 },
    { value: 'corner', weight: 8 },
    { value: 'substitution', weight: 8 },
  ])

  const payload: Record<string, BindingPrimitive> = {}
  let summary = ''
  let intensity = 8
  let burst = false

  state.accumulators[attackingTeam].passes += 1
  state.accumulators[attackingTeam].totalPossessionEvents += 1
  state.accumulators[attackingTeam].attackingThirdPossession += rng() < 0.45 ? 1 : 0

  if (eventType === 'pass') {
    const progressive = rng() < 0.35
    const packedPlayers = progressive ? randInt(rng, 1, 4) : 0
    state.accumulators[attackingTeam].progressivePasses += progressive ? 1 : 0
    state.accumulators[attackingTeam].packing += packedPlayers
    summary = `${attacker.name} completes ${progressive ? 'a progressive' : 'a short'} pass`
    intensity = progressive ? 10 : 6
    burst = progressive
    payload.progressive = progressive
    payload.packing = packedPlayers
    updatePlayerImpact(state, attacker.id, progressive ? 7 : 3)
  } else if (eventType === 'shot') {
    const xg = randFloat(rng, 0.03, 0.55)
    const onTarget = rng() < 0.43
    const goal = onTarget && rng() < clamp(xg * 1.4, 0.06, 0.62)
    state.accumulators[attackingTeam].shots += 1
    state.accumulators[attackingTeam].shotAttempts += 1
    state.accumulators[attackingTeam].shotsOnTarget += onTarget ? 1 : 0
    state.accumulators[attackingTeam].xg += xg
    state.accumulators[defendingTeam].xga += xg
    state.accumulators[attackingTeam].shotEndingSequences += 1
    state.accumulators[attackingTeam].bigChances += xg >= 0.32 ? 1 : 0
    state.playerAccumulators[attacker.id]!.shots += 1
    state.playerAccumulators[attacker.id]!.expectedGoals += xg

    if (goal) {
      state.accumulators[attackingTeam].goals += 1
      state.playerAccumulators[attacker.id]!.goals += 1
      registerScore(state, attackingTeam, 1)
      summary = `${attacker.name} buries the chance for ${state[attackingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr}`
      intensity = 24
      state.possession = defendingTeam
      updatePlayerImpact(state, attacker.id, 17)
    } else {
      summary = `${attacker.name} ${onTarget ? 'forces a save' : 'drags it wide'}`
      intensity = onTarget ? 13 : 9
      burst = true
    }

    payload.xg = toFixedNumber(xg, 3)
    payload.goal = goal
  } else if (eventType === 'foul') {
    state.accumulators[defendingTeam].fouls += 1
    summary = `${state[defendingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} commit a tactical foul`
    intensity = 8
    state.possession = attackingTeam
  } else if (eventType === 'tackle') {
    state.accumulators[defendingTeam].ballRecoveries += 1
    state.accumulators[defendingTeam].pressuresApplied += 1
    summary = `${state[defendingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} win it back with a clean tackle`
    intensity = 10
    state.possession = defendingTeam
    burst = true
  } else if (eventType === 'corner') {
    summary = `${state[attackingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} earn a corner`
    intensity = 11
    burst = true
    payload.corner = true
  } else {
    summary = `${state[attackingTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} make a substitution`
    intensity = 5
  }

  return {
    eventType,
    team: attackingTeam,
    player: attacker.name,
    payload,
    summary,
    intensity,
    burst,
  }
}

function applyLeagueEvent(state: MutableSimState, rng: () => number): Omit<SimulationEvent, 'sequence' | 'simTimeMs' | 'clock'> {
  switch (state.league) {
    case 'NBA':
      return applyNbaEvent(state, rng)
    case 'NFL':
      return applyNflEvent(state, rng)
    case 'MLB':
      return applyMlbEvent(state, rng)
    case 'NHL':
      return applyNhlEvent(state, rng)
    case 'MLS':
      return applyMlsEvent(state, rng)
  }
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0
  }
  return (numerator / denominator) * 100
}

function computeLeagueAnalytics(state: MutableSimState): {
  game: Record<string, number>
  team: { home: Record<string, number>; away: Record<string, number> }
  player: Record<string, Record<string, number>>
} {
  const home = state.accumulators.home
  const away = state.accumulators.away
  const homePlayers = state.roster.home
  const awayPlayers = state.roster.away
  const topPlayers = [...homePlayers, ...awayPlayers].slice(0, 8)
  const player: Record<string, Record<string, number>> = {}

  const game: Record<string, number> = {}
  const teamHome: Record<string, number> = {}
  const teamAway: Record<string, number> = {}

  if (state.league === 'MLB') {
    const homeBip = Math.max(1, home.hits + home.whiffs)
    const awayBip = Math.max(1, away.hits + away.whiffs)
    const homeExit = home.exitVelocitySum / homeBip
    const awayExit = away.exitVelocitySum / awayBip
    const homeLaunch = home.launchAngleSum / homeBip
    const awayLaunch = away.launchAngleSum / awayBip
    const homeSpin = home.spinRateSum / Math.max(1, home.pitches)
    const awaySpin = away.spinRateSum / Math.max(1, away.pitches)

    const homeMetrics = {
      exitVelocity: clamp(toFixedNumber(homeExit, 1), 60, 115),
      launchAngle: clamp(toFixedNumber(homeLaunch, 1), -20, 50),
      barrelPercent: clamp(toFixedNumber(percent(home.barrels, homeBip), 1), 0, 100),
      whiffPercent: clamp(toFixedNumber(percent(home.whiffs, home.pitches), 1), 0, 100),
      chaseRate: clamp(toFixedNumber(percent(home.chases, home.pitches), 1), 0, 100),
      spinRate: clamp(toFixedNumber(homeSpin, 0), 1800, 2800),
      hardHitPercent: clamp(toFixedNumber(percent(home.hardHits, homeBip), 1), 0, 100),
      xwOBA: clamp(toFixedNumber(home.xwobaSum / Math.max(1, homeBip), 3), 0.05, 0.95),
      zoneContactPercent: clamp(toFixedNumber(percent(home.zoneContacts, home.pitches), 1), 0, 100),
      sprintSpeed: clamp(toFixedNumber(home.sprintSpeedSum / Math.max(1, homeBip), 1), 24, 32),
      teamHardHitPercent: clamp(toFixedNumber(percent(home.hardHits, homeBip), 1), 0, 100),
      teamBarrelPercent: clamp(toFixedNumber(percent(home.barrels, homeBip), 1), 0, 100),
      teamXwOBA: clamp(toFixedNumber(home.xwobaSum / Math.max(1, homeBip), 3), 0.05, 0.95),
    }

    const awayMetrics = {
      exitVelocity: clamp(toFixedNumber(awayExit, 1), 60, 115),
      launchAngle: clamp(toFixedNumber(awayLaunch, 1), -20, 50),
      barrelPercent: clamp(toFixedNumber(percent(away.barrels, awayBip), 1), 0, 100),
      whiffPercent: clamp(toFixedNumber(percent(away.whiffs, away.pitches), 1), 0, 100),
      chaseRate: clamp(toFixedNumber(percent(away.chases, away.pitches), 1), 0, 100),
      spinRate: clamp(toFixedNumber(awaySpin, 0), 1800, 2800),
      hardHitPercent: clamp(toFixedNumber(percent(away.hardHits, awayBip), 1), 0, 100),
      xwOBA: clamp(toFixedNumber(away.xwobaSum / Math.max(1, awayBip), 3), 0.05, 0.95),
      zoneContactPercent: clamp(toFixedNumber(percent(away.zoneContacts, away.pitches), 1), 0, 100),
      sprintSpeed: clamp(toFixedNumber(away.sprintSpeedSum / Math.max(1, awayBip), 1), 24, 32),
      teamHardHitPercent: clamp(toFixedNumber(percent(away.hardHits, awayBip), 1), 0, 100),
      teamBarrelPercent: clamp(toFixedNumber(percent(away.barrels, awayBip), 1), 0, 100),
      teamXwOBA: clamp(toFixedNumber(away.xwobaSum / Math.max(1, awayBip), 3), 0.05, 0.95),
    }

    Object.assign(teamHome, homeMetrics)
    Object.assign(teamAway, awayMetrics)
    Object.assign(game, {
      exitVelocity: toFixedNumber((homeMetrics.exitVelocity + awayMetrics.exitVelocity) / 2, 1),
      launchAngle: toFixedNumber((homeMetrics.launchAngle + awayMetrics.launchAngle) / 2, 1),
      barrelPercent: toFixedNumber((homeMetrics.barrelPercent + awayMetrics.barrelPercent) / 2, 1),
      xwOBA: toFixedNumber((homeMetrics.xwOBA + awayMetrics.xwOBA) / 2, 3),
      hardHitPercent: toFixedNumber((homeMetrics.hardHitPercent + awayMetrics.hardHitPercent) / 2, 1),
    })
  } else if (state.league === 'NFL') {
    const homeSuccessRate = percent(home.successes, Math.max(1, home.plays))
    const awaySuccessRate = percent(away.successes, Math.max(1, away.plays))
    const homeEPA = toFixedNumber(home.epa / Math.max(1, home.plays), 2)
    const awayEPA = toFixedNumber(away.epa / Math.max(1, away.plays), 2)

    const homeMetrics = {
      EPA: homeEPA,
      successRate: toFixedNumber(homeSuccessRate, 1),
      CPOE: toFixedNumber(percent(home.successes, Math.max(1, home.dropbacks)) - 49, 1),
      pressureRate: toFixedNumber(percent(home.pressures, Math.max(1, home.dropbacks)), 1),
      airYards: toFixedNumber(home.airYards / Math.max(1, home.dropbacks), 1),
      yardsAfterContact: toFixedNumber(home.yardsAfterContact / Math.max(1, home.plays), 1),
      aDOT: toFixedNumber(home.airYards / Math.max(1, home.dropbacks), 1),
      explosivePlayPercent: toFixedNumber(percent(home.explosivePlays, Math.max(1, home.plays)), 1),
      defensiveStuffs: home.defensiveStuffs,
      neutralPace: toFixedNumber(home.plays / Math.max(1, state.period * 15), 2),
    }
    const awayMetrics = {
      EPA: awayEPA,
      successRate: toFixedNumber(awaySuccessRate, 1),
      CPOE: toFixedNumber(percent(away.successes, Math.max(1, away.dropbacks)) - 49, 1),
      pressureRate: toFixedNumber(percent(away.pressures, Math.max(1, away.dropbacks)), 1),
      airYards: toFixedNumber(away.airYards / Math.max(1, away.dropbacks), 1),
      yardsAfterContact: toFixedNumber(away.yardsAfterContact / Math.max(1, away.plays), 1),
      aDOT: toFixedNumber(away.airYards / Math.max(1, away.dropbacks), 1),
      explosivePlayPercent: toFixedNumber(percent(away.explosivePlays, Math.max(1, away.plays)), 1),
      defensiveStuffs: away.defensiveStuffs,
      neutralPace: toFixedNumber(away.plays / Math.max(1, state.period * 15), 2),
    }
    Object.assign(teamHome, homeMetrics)
    Object.assign(teamAway, awayMetrics)
    Object.assign(game, {
      EPA: toFixedNumber((homeMetrics.EPA + awayMetrics.EPA) / 2, 2),
      successRate: toFixedNumber((homeMetrics.successRate + awayMetrics.successRate) / 2, 1),
      pressureRate: toFixedNumber((homeMetrics.pressureRate + awayMetrics.pressureRate) / 2, 1),
    })
  } else if (state.league === 'NBA') {
    const homePoss = Math.max(1, home.possessions)
    const awayPoss = Math.max(1, away.possessions)
    const homePtsPerPoss = home.points / homePoss
    const awayPtsPerPoss = away.points / awayPoss
    const homeTS = percent(home.points, Math.max(1, 2 * (home.attempts + 0.44 * home.fouls)))
    const awayTS = percent(away.points, Math.max(1, 2 * (away.attempts + 0.44 * away.fouls)))

    const homeMetrics = {
      offensiveRating: toFixedNumber(homePtsPerPoss * 100, 1),
      defensiveRating: toFixedNumber((away.points / homePoss) * 100, 1),
      netRating: toFixedNumber((homePtsPerPoss - away.points / homePoss) * 100, 1),
      trueShootingPercent: toFixedNumber(homeTS, 1),
      pace: toFixedNumber((homePoss + awayPoss) / Math.max(1, state.period), 1),
      assistRatio: toFixedNumber(percent(home.assists, Math.max(1, home.attempts)), 1),
      reboundPercent: toFixedNumber(percent(home.rebounds, Math.max(1, home.rebounds + away.rebounds)), 1),
      usageRate: toFixedNumber(percent(home.attempts + home.turnovers, Math.max(1, homePoss)), 1),
      pointsPerPossession: toFixedNumber(homePtsPerPoss, 2),
      assistToTurnoverRatio: toFixedNumber(home.assists / Math.max(1, home.turnovers), 2),
    }
    const awayMetrics = {
      offensiveRating: toFixedNumber(awayPtsPerPoss * 100, 1),
      defensiveRating: toFixedNumber((home.points / awayPoss) * 100, 1),
      netRating: toFixedNumber((awayPtsPerPoss - home.points / awayPoss) * 100, 1),
      trueShootingPercent: toFixedNumber(awayTS, 1),
      pace: toFixedNumber((homePoss + awayPoss) / Math.max(1, state.period), 1),
      assistRatio: toFixedNumber(percent(away.assists, Math.max(1, away.attempts)), 1),
      reboundPercent: toFixedNumber(percent(away.rebounds, Math.max(1, home.rebounds + away.rebounds)), 1),
      usageRate: toFixedNumber(percent(away.attempts + away.turnovers, Math.max(1, awayPoss)), 1),
      pointsPerPossession: toFixedNumber(awayPtsPerPoss, 2),
      assistToTurnoverRatio: toFixedNumber(away.assists / Math.max(1, away.turnovers), 2),
    }

    Object.assign(teamHome, homeMetrics)
    Object.assign(teamAway, awayMetrics)
    Object.assign(game, {
      offensiveRating: toFixedNumber((homeMetrics.offensiveRating + awayMetrics.offensiveRating) / 2, 1),
      pace: toFixedNumber((homeMetrics.pace + awayMetrics.pace) / 2, 1),
      trueShootingPercent: toFixedNumber((homeMetrics.trueShootingPercent + awayMetrics.trueShootingPercent) / 2, 1),
    })
  } else if (state.league === 'NHL') {
    const homeShotPct = percent(home.goals, Math.max(1, home.shots))
    const awayShotPct = percent(away.goals, Math.max(1, away.shots))
    const homeSavePct = percent(home.saves, Math.max(1, away.shots))
    const awaySavePct = percent(away.saves, Math.max(1, home.shots))

    const homeMetrics = {
      expectedGoals: toFixedNumber(home.xg, 2),
      corsiPercent: toFixedNumber(percent(home.corsiFor, Math.max(1, home.corsiFor + away.corsiFor)), 1),
      fenwickPercent: toFixedNumber(percent(home.fenwickFor, Math.max(1, home.fenwickFor + away.fenwickFor)), 1),
      PDO: toFixedNumber(homeShotPct + homeSavePct, 1),
      highDangerChances: home.highDangerChances,
      zoneStartPercent: toFixedNumber(percent(home.zoneStartsOffensive, Math.max(1, home.zoneStartsTotal)), 1),
      takeaways: home.takeaways,
      expectedGoalsAgainst: toFixedNumber(home.xga, 2),
      giveaways: home.giveaways,
      slotShots: home.slotShots,
    }
    const awayMetrics = {
      expectedGoals: toFixedNumber(away.xg, 2),
      corsiPercent: toFixedNumber(percent(away.corsiFor, Math.max(1, home.corsiFor + away.corsiFor)), 1),
      fenwickPercent: toFixedNumber(percent(away.fenwickFor, Math.max(1, home.fenwickFor + away.fenwickFor)), 1),
      PDO: toFixedNumber(awayShotPct + awaySavePct, 1),
      highDangerChances: away.highDangerChances,
      zoneStartPercent: toFixedNumber(percent(away.zoneStartsOffensive, Math.max(1, away.zoneStartsTotal)), 1),
      takeaways: away.takeaways,
      expectedGoalsAgainst: toFixedNumber(away.xga, 2),
      giveaways: away.giveaways,
      slotShots: away.slotShots,
    }
    Object.assign(teamHome, homeMetrics)
    Object.assign(teamAway, awayMetrics)
    Object.assign(game, {
      expectedGoals: toFixedNumber(homeMetrics.expectedGoals + awayMetrics.expectedGoals, 2),
      corsiPercent: toFixedNumber((homeMetrics.corsiPercent + awayMetrics.corsiPercent) / 2, 1),
      PDO: toFixedNumber((homeMetrics.PDO + awayMetrics.PDO) / 2, 1),
    })
  } else {
    const homePoss = Math.max(1, home.totalPossessionEvents)
    const awayPoss = Math.max(1, away.totalPossessionEvents)
    const homeMetrics = {
      expectedGoals: toFixedNumber(home.xg, 2),
      expectedAssists: toFixedNumber(home.assists / Math.max(1, home.passes), 2),
      PPDA: toFixedNumber((away.passes + 1) / Math.max(1, home.pressuresApplied), 2),
      fieldTilt: toFixedNumber(percent(home.attackingThirdPossession, Math.max(1, home.attackingThirdPossession + away.attackingThirdPossession)), 1),
      progressivePasses: home.progressivePasses,
      packing: home.packing,
      ballRecoveries: home.ballRecoveries,
      pressures: home.pressuresApplied,
      shotEndingSequences: home.shotEndingSequences,
      bigChancesCreated: home.bigChances,
    }
    const awayMetrics = {
      expectedGoals: toFixedNumber(away.xg, 2),
      expectedAssists: toFixedNumber(away.assists / Math.max(1, away.passes), 2),
      PPDA: toFixedNumber((home.passes + 1) / Math.max(1, away.pressuresApplied), 2),
      fieldTilt: toFixedNumber(percent(away.attackingThirdPossession, Math.max(1, home.attackingThirdPossession + away.attackingThirdPossession)), 1),
      progressivePasses: away.progressivePasses,
      packing: away.packing,
      ballRecoveries: away.ballRecoveries,
      pressures: away.pressuresApplied,
      shotEndingSequences: away.shotEndingSequences,
      bigChancesCreated: away.bigChances,
    }
    Object.assign(teamHome, homeMetrics)
    Object.assign(teamAway, awayMetrics)
    Object.assign(game, {
      expectedGoals: toFixedNumber(homeMetrics.expectedGoals + awayMetrics.expectedGoals, 2),
      fieldTilt: toFixedNumber((homeMetrics.fieldTilt + awayMetrics.fieldTilt) / 2, 1),
      progressivePasses: homeMetrics.progressivePasses + awayMetrics.progressivePasses,
      possessionShareHome: toFixedNumber(percent(homePoss, homePoss + awayPoss), 1),
    })
  }

  topPlayers.forEach((playerEntry) => {
    const stats = state.playerAccumulators[playerEntry.id]!
    if (state.league === 'NBA') {
      player[playerEntry.name] = {
        points: stats.points,
        assists: stats.assists,
        rebounds: stats.rebounds,
        shots: stats.shots,
        impact: toFixedNumber(stats.recentImpact, 1),
      }
      return
    }

    if (state.league === 'NFL') {
      player[playerEntry.name] = {
        yards: stats.yards,
        completions: stats.completions,
        attempts: stats.attempts,
        points: stats.points,
        impact: toFixedNumber(stats.recentImpact, 1),
      }
      return
    }

    if (state.league === 'MLB') {
      player[playerEntry.name] = {
        hits: stats.hits,
        hardHits: stats.hardHits,
        points: stats.points,
        impact: toFixedNumber(stats.recentImpact, 1),
      }
      return
    }

    if (state.league === 'NHL') {
      player[playerEntry.name] = {
        goals: stats.goals,
        shots: stats.shots,
        hits: stats.hits,
        impact: toFixedNumber(stats.recentImpact, 1),
      }
      return
    }

    player[playerEntry.name] = {
      goals: stats.goals,
      assists: stats.assists,
      shots: stats.shots,
      expectedGoals: toFixedNumber(stats.expectedGoals, 2),
      impact: toFixedNumber(stats.recentImpact, 1),
    }
  })

  return {
    game,
    team: {
      home: teamHome,
      away: teamAway,
    },
    player,
  }
}

function buildPlayerSnapshots(state: MutableSimState): { home: SimulationPlayerSnapshot[]; away: SimulationPlayerSnapshot[] } {
  const buildList = (team: TeamSide) =>
    state.roster[team]
      .slice(0, 6)
      .map((player) => {
        const stats = state.playerAccumulators[player.id]!
        return {
          id: player.id,
          name: player.name,
          team: player.team,
          points: stats.points,
          assists: stats.assists,
          rebounds: stats.rebounds,
          shots: stats.shots,
          goals: stats.goals,
          hits: stats.hits,
          yards: stats.yards,
          impact: toFixedNumber(stats.recentImpact, 1),
        }
      })

  return {
    home: buildList('home'),
    away: buildList('away'),
  }
}

function computeGraphicsMetrics(state: MutableSimState, players: { home: SimulationPlayerSnapshot[]; away: SimulationPlayerSnapshot[] }) {
  const recentWindow = state.recentEvents.slice(-8)
  const momentumSignal = recentWindow.reduce((sum, event) => {
    if (event.team === 'home') return sum + event.intensity
    if (event.team === 'away') return sum - event.intensity
    return sum
  }, 0)

  const momentumHome = clamp(Math.round(momentumSignal / 2), -100, 100)
  const momentumAway = clamp(-momentumHome, -100, 100)

  const pressureIndex = clamp(
    Math.round(
      recentWindow.reduce((sum, event) => sum + event.intensity * (event.burst ? 1.25 : 1), 0) /
        Math.max(1, recentWindow.length),
    ),
    0,
    100,
  )

  const hottest = [...players.home, ...players.away].sort((a, b) => b.impact - a.impact)[0] ?? {
    name: 'N/A',
    impact: 0,
    points: 0,
    goals: 0,
    hits: 0,
    yards: 0,
  }

  const hottestMetric =
    state.league === 'NBA'
      ? `${hottest.points} pts / 5m`
      : state.league === 'NFL'
        ? `${hottest.yards} yds streak`
        : state.league === 'MLB'
          ? `${hottest.hits} hard-hit streak`
          : state.league === 'NHL'
            ? `${hottest.goals} goal impact`
            : `${hottest.goals} goal threat`

  const scoreDiff = state.accumulators.home.score - state.accumulators.away.score
  const possessionDelta =
    percent(state.accumulators.home.totalPossessionEvents, Math.max(1, state.accumulators.home.totalPossessionEvents + state.accumulators.away.totalPossessionEvents)) -
    50
  const qualityDelta =
    (state.accumulators.home.shotAttempts + state.accumulators.home.xg * 10) -
    (state.accumulators.away.shotAttempts + state.accumulators.away.xg * 10)
  const dominanceHome = clamp(Math.round(50 + scoreDiff * 6 + possessionDelta * 0.8 + qualityDelta * 0.7), 0, 100)
  const dominanceAway = clamp(100 - dominanceHome, 0, 100)

  const lateGameWeight = state.league === 'MLB' ? Math.max(0, state.mlb.inning - 6) / 4 : Math.max(0, state.period - 2) / 3
  const clutchScore = clamp(Math.round(hottest.impact * (0.6 + lateGameWeight)), 0, 100)

  return {
    momentum: {
      home: momentumHome,
      away: momentumAway,
    },
    pressure: {
      index: pressureIndex,
    },
    hottestPlayer: {
      name: hottest.name,
      metric: hottestMetric,
    },
    dominance: {
      home: dominanceHome,
      away: dominanceAway,
    },
    clutch: {
      player: hottest.name,
      score: clutchScore,
    },
  }
}

function computeCombackProbability(state: MutableSimState): { team: TeamSide; probability: number } {
  const homeScore = state.accumulators.home.score
  const awayScore = state.accumulators.away.score
  const trailingTeam: TeamSide = homeScore < awayScore ? 'home' : 'away'
  const scoreGap = Math.abs(homeScore - awayScore)
  const progress =
    state.league === 'MLB'
      ? clamp(state.mlb.inning / 9, 0, 1)
      : clamp((state.period - 1) / Math.max(1, PRIMARY_PERIODS[state.league]), 0, 1)
  const rawProbability = clamp(0.56 - scoreGap * 0.07 + (1 - progress) * 0.32, 0.04, 0.88)
  return {
    team: trailingTeam,
    probability: toFixedNumber(rawProbability * 100, 1),
  }
}

function buildStory(state: MutableSimState, graphics: SimulationSnapshot['graphics'], players: SimulationSnapshot['players']): SimulationStory {
  const topPlayer = [...players.home, ...players.away].sort((a, b) => b.impact - a.impact)[0]
  const hotStreakDescription =
    topPlayer && topPlayer.impact > 25
      ? `${topPlayer.name} is surging with ${state.league === 'NBA' ? `${topPlayer.points} points` : state.league === 'NFL' ? `${topPlayer.yards} yards` : `${topPlayer.goals + topPlayer.hits} impact plays`} in the recent run`
      : 'No major hot streak detected yet'

  const momentumShiftTeam: TeamSide = graphics.momentum.home >= 0 ? 'home' : 'away'
  const momentumShiftDescription =
    Math.abs(graphics.momentum.home) > 30
      ? `${state[momentumShiftTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} own the momentum swing`
      : 'Momentum currently balanced'

  const recordTarget = state.league === 'NBA' ? 50 : state.league === 'NFL' ? 350 : state.league === 'MLB' ? 5 : state.league === 'NHL' ? 4 : 4
  const recordProgress = topPlayer
    ? state.league === 'NBA'
      ? topPlayer.points
      : state.league === 'NFL'
        ? topPlayer.yards
        : state.league === 'MLB'
          ? topPlayer.hits
          : topPlayer.goals
    : 0
  const recordWatchDescription = topPlayer
    ? `${topPlayer.name} is ${Math.max(0, recordTarget - recordProgress)} away from tonight's benchmark`
    : 'Record watch unavailable'

  const comeback = computeCombackProbability(state)
  const defensiveTeam: TeamSide = graphics.pressure.index > 62 ? otherTeam(momentumShiftTeam) : momentumShiftTeam
  const defenseDescription =
    graphics.pressure.index > 62
      ? `${state[defensiveTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr} have tightened defensively in the last stretch`
      : 'Defensive pressure remains moderate'

  const paceDescription = topPlayer
    ? `${topPlayer.name} projects to a historic pace if current rate holds`
    : 'Historic pace indicators are stable'

  const headline = [hotStreakDescription, momentumShiftDescription, defenseDescription].find(
    (entry) => entry && !entry.startsWith('No ') && !entry.startsWith('Momentum currently balanced'),
  )

  return {
    hotStreak: {
      player: topPlayer?.name,
      description: hotStreakDescription,
    },
    momentumShift: {
      team: state[momentumShiftTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr,
      description: momentumShiftDescription,
    },
    recordWatch: {
      player: topPlayer?.name,
      description: recordWatchDescription,
    },
    comeback: {
      team: state[comeback.team === 'home' ? 'homeTeam' : 'awayTeam'].abbr,
      probability: comeback.probability,
      description: `${state[comeback.team === 'home' ? 'homeTeam' : 'awayTeam'].abbr} comeback probability ${comeback.probability}%`,
    },
    defense: {
      team: state[defensiveTeam === 'home' ? 'homeTeam' : 'awayTeam'].abbr,
      description: defenseDescription,
    },
    historicPace: {
      player: topPlayer?.name,
      description: paceDescription,
    },
    headline: headline ?? `Simulation live: ${state.homeTeam.abbr} ${state.accumulators.home.score} - ${state.awayTeam.abbr} ${state.accumulators.away.score}`,
  }
}
function buildSnapshot(state: MutableSimState): SimulationSnapshot {
  const players = buildPlayerSnapshots(state)
  const analytics = computeLeagueAnalytics(state)
  const graphics = computeGraphicsMetrics(state, players)
  const story = buildStory(state, graphics, players)

  return {
    game: {
      id: state.gameId,
      league: state.league,
      status: state.status === 'pregame' ? 'PREGAME' : state.status === 'final' ? 'FINAL' : 'LIVE',
      clock: {
        display: formatClock(state),
        secondsRemaining: state.clockSec,
      },
      period: state.period,
      possession: state.possession,
      score: {
        home: state.accumulators.home.score,
        away: state.accumulators.away.score,
      },
    },
    teams: {
      home: state.homeTeam,
      away: state.awayTeam,
    },
    players,
    analytics,
    graphics,
    story,
    recentEvents: state.recentEvents.slice(-8).reverse(),
    context: {
      nfl: { ...state.nfl },
      mlb: { ...state.mlb, bases: { ...state.mlb.bases } },
      nba: { ...state.nba },
      nhl: { ...state.nhl },
      mls: { ...state.mls },
    },
  }
}

function pickLogicalInterval(rng: () => number, burst: boolean): number {
  if (burst) {
    return randInt(rng, 60, 190)
  }
  return randInt(rng, 250, 700)
}

function runEventGeneration(state: MutableSimState, rng: () => number, targetCount: number): SimulationFrame[] {
  const frames: SimulationFrame[] = []

  for (let index = 0; index < targetCount; index += 1) {
    advanceClock(state, rng)
    const leagueEvent = applyLeagueEvent(state, rng)
    state.sequence += 1
    state.simTimeMs += pickLogicalInterval(rng, leagueEvent.burst)
    state.status = 'live'

    const event: SimulationEvent = {
      sequence: state.sequence,
      simTimeMs: state.simTimeMs,
      clock: formatClock(state),
      eventType: leagueEvent.eventType,
      team: leagueEvent.team,
      player: leagueEvent.player,
      payload: leagueEvent.payload,
      summary: leagueEvent.summary,
      intensity: leagueEvent.intensity,
      burst: leagueEvent.burst,
    }

    registerRecentEvent(state, event)
    const snapshot = buildSnapshot(state)
    frames.push({ event, snapshot })
  }

  state.status = 'final'
  return frames
}

function flattenValues(value: unknown, prefix: string, output: Record<string, BindingPrimitive>) {
  if (value === null || value === undefined) {
    output[prefix] = null
    return
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output[prefix] = value
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      flattenValues(entry, `${prefix}.${index + 1}`, output)
    })
    return
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key
      flattenValues(entry, nextKey, output)
    })
  }
}

export function buildSimulationBindingValues(snapshot: SimulationSnapshot): Record<string, BindingPrimitive> {
  const output: Record<string, BindingPrimitive> = {}

  const buildPlayerBindingRow = (player: SimulationPlayerSnapshot) => {
    if (snapshot.game.league === 'NBA') {
      return {
        Name: player.name,
        Points: player.points,
        Assists: player.assists,
        Rebounds: player.rebounds,
        Shots: player.shots,
        Impact: player.impact,
      }
    }

    if (snapshot.game.league === 'NFL') {
      return {
        Name: player.name,
        Yards: player.yards,
        Points: player.points,
        Impact: player.impact,
      }
    }

    if (snapshot.game.league === 'MLB') {
      return {
        Name: player.name,
        Hits: player.hits,
        Runs: player.points,
        Impact: player.impact,
      }
    }

    if (snapshot.game.league === 'NHL') {
      return {
        Name: player.name,
        Goals: player.goals,
        Shots: player.shots,
        Hits: player.hits,
        Impact: player.impact,
      }
    }

    return {
      Name: player.name,
      Goals: player.goals,
      Assists: player.assists,
      Shots: player.shots,
      Impact: player.impact,
    }
  }

  const playerTree = {
    Home: snapshot.players.home.map((player) => buildPlayerBindingRow(player)),
    Away: snapshot.players.away.map((player) => buildPlayerBindingRow(player)),
  }

  const recentEventTree = snapshot.recentEvents.map((event) => ({
    Sequence: event.sequence,
    Clock: event.clock,
    Team: event.team,
    Type: event.eventType,
    Player: event.player,
    Summary: event.summary,
  }))

  flattenValues(
    {
      Game: {
        Id: snapshot.game.id,
        League: snapshot.game.league,
        Status: snapshot.game.status,
        Clock: {
          Display: snapshot.game.clock.display,
          SecondsRemaining: snapshot.game.clock.secondsRemaining,
        },
        Period: snapshot.game.period,
        Possession: snapshot.game.possession.toUpperCase(),
        Score: {
          Home: snapshot.game.score.home,
          Away: snapshot.game.score.away,
        },
      },
      Teams: {
        Home: {
          Name: snapshot.teams.home.name,
          Abbr: snapshot.teams.home.abbr,
        },
        Away: {
          Name: snapshot.teams.away.name,
          Abbr: snapshot.teams.away.abbr,
        },
      },
      Players: playerTree,
      Analytics: {
        Game: snapshot.analytics.game,
        Team: {
          Home: snapshot.analytics.team.home,
          Away: snapshot.analytics.team.away,
        },
        Player: snapshot.analytics.player,
      },
      Graphics: {
        Momentum: {
          Home: snapshot.graphics.momentum.home,
          Away: snapshot.graphics.momentum.away,
        },
        Pressure: {
          Index: snapshot.graphics.pressure.index,
        },
        HottestPlayer: {
          Name: snapshot.graphics.hottestPlayer.name,
          Metric: snapshot.graphics.hottestPlayer.metric,
        },
        Dominance: {
          Home: snapshot.graphics.dominance.home,
          Away: snapshot.graphics.dominance.away,
        },
        Clutch: {
          Player: snapshot.graphics.clutch.player,
          Score: snapshot.graphics.clutch.score,
        },
      },
      Stories: {
        HotStreak: snapshot.story.hotStreak,
        MomentumShift: snapshot.story.momentumShift,
        RecordWatch: snapshot.story.recordWatch,
        Comeback: snapshot.story.comeback,
        Defense: snapshot.story.defense,
        HistoricPace: snapshot.story.historicPace,
        Headline: snapshot.story.headline,
      },
      RecentEvents: recentEventTree,
      Context: {
        NFL: snapshot.context.nfl,
        MLB: {
          Inning: snapshot.context.mlb.inning,
          Half: snapshot.context.mlb.half,
          Outs: snapshot.context.mlb.outs,
          Balls: snapshot.context.mlb.balls,
          Strikes: snapshot.context.mlb.strikes,
          Bases: snapshot.context.mlb.bases,
        },
        NBA: snapshot.context.nba,
        NHL: snapshot.context.nhl,
        MLS: snapshot.context.mls,
      },
    },
    '',
    output,
  )

  output.homeScore = snapshot.game.score.home
  output.awayScore = snapshot.game.score.away
  output.clock = snapshot.game.clock.display
  output.possession = snapshot.game.possession.toUpperCase()
  output.period = snapshot.game.period
  output.shotClock = snapshot.context.nba.shotClock
  output.homeFouls = snapshot.context.nba.homeFouls
  output.awayFouls = snapshot.context.nba.awayFouls
  output.headline = snapshot.story.headline

  return output
}

export function buildSimulationBindingFields(snapshot: SimulationSnapshot): SimulationBindingField[] {
  const bindingValues = buildSimulationBindingValues(snapshot)
  return Object.entries(bindingValues)
    .map(([key, value]) => {
      const kind: SimulationBindingField['kind'] =
        typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'enum' : 'string'
      const group = key.includes('.') ? key.split('.')[0]! : 'Core'
      return {
        key,
        label: makeBindingLabel(key),
        group,
        kind,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function createSimulationTimeline(config: SimulationBuildConfig): SimulationTimeline {
  const seed = Number.isFinite(config.seed) ? Math.max(1, Math.floor(config.seed)) : 1
  const normalizedConfig: SimulationBuildConfig = {
    league: config.league,
    speed: config.speed,
    seed,
  }
  const rng = createRng(seed)
  const state = initState(normalizedConfig)
  const eventRange = EVENT_COUNT_RANGES[normalizedConfig.league]
  const targetCount = randInt(rng, eventRange.min, eventRange.max)
  const initialSnapshot = buildSnapshot(state)
  const frames = runEventGeneration(state, rng, targetCount)
  const bindingFields = buildSimulationBindingFields(frames[0]?.snapshot ?? initialSnapshot)

  return {
    gameId: state.gameId,
    league: normalizedConfig.league,
    seed,
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    frames,
    initialSnapshot,
    bindingFields,
  }
}

export function simulationDelayForEvent(speed: SimulationSpeed, event: SimulationEvent, previousEvent?: SimulationEvent): number {
  const normalRange = SPEED_RANGES[speed]
  const burstRange = BURST_RANGES[speed]
  const baseRange = event.burst ? burstRange : normalRange
  const logicalGap = previousEvent ? Math.max(1, event.simTimeMs - previousEvent.simTimeMs) : normalRange.min
  const normalized = clamp((logicalGap - 60) / 640, 0, 1)
  const delay = Math.round(baseRange.min + (baseRange.max - baseRange.min) * normalized)
  return clamp(delay, event.burst ? burstRange.min : normalRange.min, event.burst ? burstRange.max : normalRange.max)
}
