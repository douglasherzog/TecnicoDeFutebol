import type { CommentatorStyle, LiveMatch, LiveTeamStats, MatchEvent, Player, PlayerRating, Position, PostMatchReport, PreMatchAnalysis, TacticalApproach, Team } from '../types';
import { getStartingLineup, getTacticalModifier, getTeamStrength, getTeamTactics } from './squadEngine';

const HALF_TIME_MINUTE = 45;
const FULL_TIME_MINUTE = 90;
const FOUL_PROBABILITY = 0.012;
const CARD_ON_FOUL_PROBABILITY = 0.25;
const RED_CARD_PROBABILITY = 0.03;
const PENALTY_PROBABILITY = 0.004;
const INJURY_PROBABILITY = 0.003;
const OWN_GOAL_PROBABILITY = 0.02;

const SCORER_WEIGHTS: Record<Position, number> = {
  GOL: 0, ZAG: 1, LAT: 2, VOL: 3, MEI: 6, ATA: 12,
};

const COMMENTARY: Record<CommentatorStyle, {
  goal: (scorer: string, team: string, ctx: string) => string;
  save: (keeper: string, team: string) => string;
  miss: (team: string) => string;
  foul: (player: string) => string;
  card: (player: string) => string;
  redCard: (player: string) => string;
  penaltyGoal: (scorer: string, team: string) => string;
  penaltyMiss: (team: string) => string;
  injury: (player: string) => string;
  ownGoal: (team: string) => string;
}> = {
  technical: {
    goal: (scorer, _team, ctx) => `Gol de ${scorer}. ${ctx}`,
    save: (keeper, _team) => `${keeper} faz grande defesa.`,
    miss: (team) => `${team} finaliza, mas não acerta o alvo.`,
    foul: (player) => `Falta de ${player}.`,
    card: (player) => `Cartão amarelo para ${player}.`,
    redCard: (player) => `Cartão vermelho! ${player} é expulso.`,
    penaltyGoal: (scorer, _team) => `Pênalti convertido por ${scorer}.`,
    penaltyMiss: (team) => `${team} desperdiça o pênalti.`,
    injury: (player) => `${player} se machuca e precisa de atendimento.`,
    ownGoal: (team) => `Gol contra! ${team} marca contra o próprio gol.`,
  },
  passionate: {
    goal: (scorer, team, ctx) => `GOOOOL! ${scorer} explode as redes pelo ${team}! ${ctx}`,
    save: (keeper, _team) => `QUE DEFESA! ${keeper} salva de forma incrível!`,
    miss: (team) => `${team} perde chance incrível! Não acredito!`,
    foul: (player) => `Falta dura de ${player}!`,
    card: (player) => `Amarelo para ${player}!`,
    redCard: (player) => `VERMELHO! ${player} deixa o time com um a menos!`,
    penaltyGoal: (scorer, _team) => `PÊNALTI! ${scorer} bate com categoria — GOOL!`,
    penaltyMiss: (team) => `${team} PERDE o pênalti! Inacreditável!`,
    injury: (player) => `${player} sai de maca! Que cena preocupante!`,
    ownGoal: (team) => `GOL CONTRA! ${team} marca contra! Tragédia!`,
  },
  neutral: {
    goal: (scorer, _team, ctx) => `Gol marcado por ${scorer}. ${ctx}`,
    save: (keeper, _team) => `Defesa de ${keeper}.`,
    miss: (team) => `Finalização errada de ${team}.`,
    foul: (player) => `Falta cometida por ${player}.`,
    card: (player) => `Advertência para ${player}.`,
    redCard: (player) => `Expulsão de ${player}.`,
    penaltyGoal: (scorer, _team) => `Pênalti convertido por ${scorer}.`,
    penaltyMiss: (team) => `${team} erra o pênalti.`,
    injury: (player) => `${player} precisa de atendimento médico.`,
    ownGoal: (team) => `Gol contra de ${team}.`,
  },
};

export function randomCommentatorStyle(): CommentatorStyle {
  const styles: CommentatorStyle[] = ['technical', 'passionate', 'neutral'];
  return styles[Math.floor(Math.random() * styles.length)];
}

function pickPlayer(team: Team, weights: Record<Player['position'], number>): Player | undefined {
  const lineup = getStartingLineup(team);
  const totalWeight = lineup.reduce((sum, player) => sum + weights[player.position], 0);
  if (totalWeight === 0) return lineup[0];
  let roll = Math.random() * totalWeight;
  for (const player of lineup) {
    roll -= weights[player.position];
    if (roll <= 0) return player;
  }
  return lineup[lineup.length - 1];
}

function effectiveStrength(team: Team, approach: TacticalApproach, opponentApproach: TacticalApproach): number {
  const modifier = getTacticalModifier(approach);
  const opponentModifier = getTacticalModifier(opponentApproach);
  return Math.max(20, getTeamStrength(team) + modifier.attack - opponentModifier.defense);
}

function goalProbabilityPerMinute(strength: number, isHome: boolean): number {
  const averageGoals = (strength / 100) * 2.5 + (isHome ? 0.15 : 0);
  return averageGoals / FULL_TIME_MINUTE;
}

interface SideContext {
  team: Team;
  opponent: Team;
  isHome: boolean;
}

interface MatchSituation {
  homeGoals: number;
  awayGoals: number;
  minute: number;
  commentator: CommentatorStyle;
}

function goalContext(scorerTeam: Team, situation: MatchSituation, isHome: boolean): string {
  const { homeGoals, awayGoals, minute } = situation;
  const newScorerGoals = isHome ? homeGoals + 1 : awayGoals + 1;
  const newOpponentGoals = isHome ? awayGoals : homeGoals;
  const wasLosing = isHome ? homeGoals < awayGoals : awayGoals < homeGoals;
  const wasDrawing = isHome ? homeGoals === awayGoals : awayGoals === homeGoals;
  const isLastMinute = minute >= 85;
  const isDraw = newScorerGoals === newOpponentGoals;
  const isWinner = newScorerGoals > newOpponentGoals;
  const diff = Math.abs(newScorerGoals - newOpponentGoals);

  if (wasLosing && isDraw) return `${scorerTeam.name} empata! Que reação!`;
  if (wasLosing && isWinner) return `${scorerTeam.name} vira o jogo!`;
  if (wasDrawing && isWinner) return `${scorerTeam.name} abre o placar!`;
  if (isLastMinute && isDraw) return `${scorerTeam.name} empata nos minutos finais! Drama total!`;
  if (isLastMinute && isWinner && wasDrawing) return `${scorerTeam.name} decide nos acréscimos!`;
  if (isWinner && diff >= 3) return `${scorerTeam.name} administra com folga.`;
  return `${scorerTeam.name} amplia o lead.`;
}

function generateMinuteEvents(minute: number, side: SideContext, goalProbability: number, situation: MatchSituation): MatchEvent[] {
  const events: MatchEvent[] = [];
  const c = COMMENTARY[situation.commentator];
  const roll = Math.random();

  if (roll < PENALTY_PROBABILITY) {
    const taker = pickPlayer(side.team, { GOL: 0, ZAG: 2, LAT: 2, VOL: 4, MEI: 8, ATA: 10 });
    if (Math.random() < 0.75) {
      events.push({
        minute, type: 'penalty_goal', teamId: side.team.id, playerId: taker?.id,
        description: c.penaltyGoal(taker?.name ?? side.team.name, side.team.name),
        xg: 0.76,
      });
    } else {
      events.push({
        minute, type: 'penalty_miss', teamId: side.team.id, playerId: taker?.id,
        description: c.penaltyMiss(side.team.name),
        xg: 0.76,
      });
    }
  } else if (roll < PENALTY_PROBABILITY + INJURY_PROBABILITY) {
    const victim = pickPlayer(side.team, { GOL: 1, ZAG: 3, LAT: 3, VOL: 3, MEI: 3, ATA: 2 });
    events.push({
      minute, type: 'injury', teamId: side.team.id, playerId: victim?.id,
      description: c.injury(victim?.name ?? side.team.name),
    });
  } else if (roll < goalProbability) {
    const isOwnGoal = Math.random() < OWN_GOAL_PROBABILITY;
    if (isOwnGoal) {
      const ownScorer = pickPlayer(side.opponent, { GOL: 1, ZAG: 5, LAT: 4, VOL: 3, MEI: 2, ATA: 1 });
      events.push({
        minute, type: 'own_goal', teamId: side.team.id, playerId: ownScorer?.id,
        description: c.ownGoal(side.opponent.name),
        xg: 0.2 + Math.random() * 0.3,
      });
    } else {
      const scorer = pickPlayer(side.team, SCORER_WEIGHTS);
      const ctx = goalContext(side.team, situation, side.isHome);
      events.push({
        minute, type: 'goal', teamId: side.team.id, playerId: scorer?.id,
        description: c.goal(scorer?.name ?? side.team.name, side.team.name, ctx),
        xg: 0.3 + Math.random() * 0.5,
      });
    }
  } else if (roll < goalProbability * 2.2) {
    const keeper = getStartingLineup(side.opponent).find(player => player.position === 'GOL');
    events.push({
      minute, type: 'save', teamId: side.opponent.id, playerId: keeper?.id,
      description: c.save(keeper?.name ?? 'O goleiro', side.team.name),
      xg: 0.1 + Math.random() * 0.3,
    });
  } else if (roll < goalProbability * 3.2) {
    const attacker = pickPlayer(side.team, SCORER_WEIGHTS);
    events.push({
      minute, type: 'miss', teamId: side.team.id, playerId: attacker?.id,
      description: c.miss(side.team.name),
      xg: 0.03 + Math.random() * 0.2,
    });
  } else if (roll < goalProbability * 3.2 + FOUL_PROBABILITY) {
    const offender = pickPlayer(side.team, { GOL: 1, ZAG: 5, LAT: 4, VOL: 5, MEI: 3, ATA: 2 });
    if (Math.random() < RED_CARD_PROBABILITY) {
      events.push({
        minute, type: 'red_card', teamId: side.team.id, playerId: offender?.id,
        description: c.redCard(offender?.name ?? side.team.name),
      });
    } else if (Math.random() < CARD_ON_FOUL_PROBABILITY) {
      events.push({
        minute, type: 'card', teamId: side.team.id, playerId: offender?.id,
        description: c.card(offender?.name ?? side.team.name),
      });
    } else {
      events.push({
        minute, type: 'foul', teamId: side.team.id, playerId: offender?.id,
        description: c.foul(offender?.name ?? side.team.name),
      });
    }
  }

  return events;
}

function generateHalfEvents(
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
  startMinute: number,
  endMinute: number,
  commentator: CommentatorStyle,
  initialHomeGoals: number = 0,
  initialAwayGoals: number = 0,
): MatchEvent[] {
  const homeProbability = goalProbabilityPerMinute(effectiveStrength(homeTeam, homeApproach, awayApproach), true);
  const awayProbability = goalProbabilityPerMinute(effectiveStrength(awayTeam, awayApproach, homeApproach), false);
  const events: MatchEvent[] = [];
  let homeGoals = initialHomeGoals;
  let awayGoals = initialAwayGoals;

  for (let minute = startMinute; minute <= endMinute; minute++) {
    if (minute === HALF_TIME_MINUTE || minute >= FULL_TIME_MINUTE) continue;
    const situation: MatchSituation = { homeGoals, awayGoals, minute, commentator };
    const homeEvents = generateMinuteEvents(minute, { team: homeTeam, opponent: awayTeam, isHome: true }, homeProbability, situation);
    homeEvents.forEach(event => { if (event.type === 'goal' || event.type === 'penalty_goal' || event.type === 'own_goal') homeGoals++; });
    events.push(...homeEvents);
    const awaySituation: MatchSituation = { homeGoals, awayGoals, minute, commentator };
    const awayEvents = generateMinuteEvents(minute, { team: awayTeam, opponent: homeTeam, isHome: false }, awayProbability, awaySituation);
    awayEvents.forEach(event => { if (event.type === 'goal' || event.type === 'penalty_goal' || event.type === 'own_goal') awayGoals++; });
    events.push(...awayEvents);
  }

  return events;
}

const GOAL_TYPES: MatchEvent['type'][] = ['goal', 'penalty_goal', 'own_goal'];
const SHOT_TYPES: MatchEvent['type'][] = ['goal', 'penalty_goal', 'own_goal', 'penalty_miss', 'miss'];

export function countGoals(events: MatchEvent[], teamId: string, untilMinute: number = FULL_TIME_MINUTE): number {
  return events.filter(event => GOAL_TYPES.includes(event.type) && event.teamId === teamId && event.minute <= untilMinute).length;
}

// A 'save' event carries the defending team's id, so the shot belongs to the opponent
export function computeTeamStats(events: MatchEvent[], teamId: string, opponentId: string, untilMinute: number): LiveTeamStats {
  const visible = events.filter(event => event.minute <= untilMinute);
  const shotsOwn = visible.filter(event => SHOT_TYPES.includes(event.type) && event.teamId === teamId);
  const shotsSaved = visible.filter(event => event.type === 'save' && event.teamId === opponentId);
  const goals = shotsOwn.filter(event => GOAL_TYPES.includes(event.type));

  return {
    shots: shotsOwn.length + shotsSaved.length,
    onTarget: goals.length + shotsSaved.length,
    xg: [...shotsOwn, ...shotsSaved].reduce((sum, event) => sum + (event.xg ?? 0), 0),
    fouls: visible.filter(event => (event.type === 'foul' || event.type === 'card' || event.type === 'red_card') && event.teamId === teamId).length,
    cards: visible.filter(event => (event.type === 'card' || event.type === 'red_card') && event.teamId === teamId).length,
    possession: 0,
  };
}

// Share of attacking actions in the recent window, used for the momentum bar
export function computeMomentum(events: MatchEvent[], teamId: string, opponentId: string, untilMinute: number, windowSize = 15): number {
  const start = Math.max(1, untilMinute - windowSize);
  const recent = events.filter(event => event.minute >= start && event.minute <= untilMinute);
  const attackingFor = recent.filter(event =>
    (SHOT_TYPES.includes(event.type) && event.teamId === teamId) ||
    (event.type === 'save' && event.teamId === opponentId),
  ).length;
  const attackingAgainst = recent.filter(event =>
    (SHOT_TYPES.includes(event.type) && event.teamId === opponentId) ||
    (event.type === 'save' && event.teamId === teamId),
  ).length;
  const total = attackingFor + attackingAgainst;
  return total === 0 ? 0.5 : attackingFor / total;
}

const MARKER_TYPES: MatchEvent['type'][] = ['kickoff', 'halftime', 'fulltime'];

function assembleLiveMatch(
  homeTeam: Team,
  awayTeam: Team,
  matchId: string,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
  openPlayEvents: MatchEvent[],
  substitutionsUsed: number,
): LiveMatch {
  const kickoff: MatchEvent = { minute: 1, type: 'kickoff', teamId: null, description: 'Começa a partida!' };
  const halftime: MatchEvent = { minute: HALF_TIME_MINUTE, type: 'halftime', teamId: null, description: 'Intervalo. Hora de ajustar a equipe.' };
  const fulltime: MatchEvent = { minute: FULL_TIME_MINUTE, type: 'fulltime', teamId: null, description: 'Fim de jogo!' };
  const events: MatchEvent[] = [kickoff, ...openPlayEvents, halftime, fulltime]
    .sort((a, b) => a.minute - b.minute);

  return {
    match: {
      id: matchId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeGoals: countGoals(events, homeTeam.id),
      awayGoals: countGoals(events, awayTeam.id),
      played: true,
    },
    events,
    homeApproach,
    awayApproach,
    substitutionsUsed,
  };
}

export function createLiveMatch(homeTeam: Team, awayTeam: Team, matchId: string): LiveMatch {
  const homeApproach = getTeamTactics(homeTeam).approach;
  const awayApproach = getTeamTactics(awayTeam).approach;
  const commentator = randomCommentatorStyle();
  const openPlay = generateHalfEvents(homeTeam, awayTeam, homeApproach, awayApproach, 2, FULL_TIME_MINUTE - 1, commentator);
  const match = assembleLiveMatch(homeTeam, awayTeam, matchId, homeApproach, awayApproach, openPlay, 0);
  return { ...match, commentatorStyle: commentator };
}

// Keeps everything before fromMinute and regenerates the remaining open play,
// optionally inserting extra events (e.g. a substitution announcement)
export function regenerateFromMinute(
  liveMatch: LiveMatch,
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
  fromMinute: number,
  extraEvents: MatchEvent[] = [],
): LiveMatch {
  const commentator = liveMatch.commentatorStyle ?? 'neutral';
  const kept = liveMatch.events.filter(event => event.minute < fromMinute && !MARKER_TYPES.includes(event.type));
  const currentHomeGoals = countGoals(kept, homeTeam.id);
  const currentAwayGoals = countGoals(kept, awayTeam.id);
  const regenerated = generateHalfEvents(
    homeTeam, awayTeam, homeApproach, awayApproach,
    Math.max(2, fromMinute), FULL_TIME_MINUTE - 1,
    commentator, currentHomeGoals, currentAwayGoals,
  );
  const assembled = assembleLiveMatch(
    homeTeam,
    awayTeam,
    liveMatch.match.id,
    homeApproach,
    awayApproach,
    [...kept, ...extraEvents, ...regenerated],
    liveMatch.substitutionsUsed ?? 0,
  );
  return { ...assembled, commentatorStyle: commentator };
}

// Regenerates the second half after a halftime tactical change
export function applySecondHalfTactics(
  liveMatch: LiveMatch,
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
): LiveMatch {
  return regenerateFromMinute(liveMatch, homeTeam, awayTeam, homeApproach, awayApproach, HALF_TIME_MINUTE + 1);
}

// Simulated possession based on team strength and approach
export function computePossession(
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
  untilMinute: number,
): { home: number; away: number } {
  if (untilMinute < 1) return { home: 50, away: 50 };
  const homeStrength = effectiveStrength(homeTeam, homeApproach, awayApproach);
  const awayStrength = effectiveStrength(awayTeam, awayApproach, homeApproach);
  const homeMod = homeApproach === 'attacking' ? 1.1 : homeApproach === 'defensive' ? 0.85 : 1;
  const awayMod = awayApproach === 'attacking' ? 1.1 : awayApproach === 'defensive' ? 0.85 : 1;
  const homeWeight = homeStrength * homeMod + (homeTeam ? 5 : 0); // home advantage
  const awayWeight = awayStrength * awayMod;
  const total = homeWeight + awayWeight;
  return { home: Math.round((homeWeight / total) * 100), away: Math.round((awayWeight / total) * 100) };
}

// Tension meter: rises with late goals, red cards, penalties, close score
export function computeTension(events: MatchEvent[], untilMinute: number): number {
  const visible = events.filter(event => event.minute <= untilMinute);
  let tension = 20;
  for (const event of visible) {
    if (event.type === 'red_card') tension += 15;
    if (event.type === 'penalty_goal' || event.type === 'penalty_miss') tension += 12;
    if (event.type === 'own_goal') tension += 10;
    if (event.type === 'goal' && event.minute >= 80) tension += 15;
    if (event.type === 'goal' && event.minute >= 70 && event.minute < 80) tension += 8;
    if (event.type === 'card') tension += 3;
    if (event.type === 'injury') tension += 5;
  }
  return Math.min(100, tension);
}

// Individual player ratings based on events
export function computePlayerRatings(
  events: MatchEvent[],
  team: Team,
  untilMinute: number,
): PlayerRating[] {
  const visible = events.filter(event => event.minute <= untilMinute);
  const lineup = getStartingLineup(team);

  const ratings = new Map<string, PlayerRating>();
  for (const player of lineup) {
    ratings.set(player.id, {
      playerId: player.id,
      name: player.name,
      position: player.position,
      rating: 6.0,
      goals: 0,
      assists: 0,
      saves: 0,
      cards: 0,
    });
  }

  for (const event of visible) {
    if (!event.playerId) continue;
    const r = ratings.get(event.playerId);
    if (!r) continue;

    switch (event.type) {
      case 'goal':
      case 'penalty_goal':
        r.goals++;
        r.rating += 2.5;
        break;
      case 'own_goal':
        r.rating -= 2.0;
        break;
      case 'penalty_miss':
        r.rating -= 1.0;
        break;
      case 'save':
        r.saves++;
        r.rating += 1.0;
        break;
      case 'miss':
        r.rating -= 0.2;
        break;
      case 'card':
        r.cards++;
        r.rating -= 0.5;
        break;
      case 'red_card':
        r.cards++;
        r.rating -= 2.0;
        break;
      case 'foul':
        r.rating -= 0.1;
        break;
      case 'injury':
        r.rating -= 0.3;
        break;
    }
  }

  return Array.from(ratings.values()).map(r => ({
    ...r,
    rating: Math.max(1, Math.min(10, Math.round(r.rating * 10) / 10)),
  }));
}

// Pre-match analysis with strength comparison and win probabilities
export function computePreMatchAnalysis(
  homeTeam: Team,
  awayTeam: Team,
  homeApproach: TacticalApproach,
  awayApproach: TacticalApproach,
  recentResults: { teamId: string; results: ('W' | 'D' | 'L')[] }[] = [],
): PreMatchAnalysis {
  const homeStrength = effectiveStrength(homeTeam, homeApproach, awayApproach);
  const awayStrength = effectiveStrength(awayTeam, awayApproach, homeApproach);
  const homeAdvantage = 5;
  const homeRaw = homeStrength + homeAdvantage;
  const awayRaw = awayStrength;
  const totalRaw = homeRaw + awayRaw;

  const homeWinProb = Math.round((homeRaw / totalRaw) * 100);
  const awayWinProb = Math.round((awayRaw / totalRaw) * 100);
  const drawProb = 100 - homeWinProb - awayWinProb;

  return {
    homeStrength: Math.round(homeStrength),
    awayStrength: Math.round(awayStrength),
    homeWinProb: Math.max(5, homeWinProb),
    drawProb: Math.max(10, drawProb),
    awayWinProb: Math.max(5, awayWinProb),
    expectedGoalsHome: Math.round((homeStrength / 100) * 2.5 * 10) / 10,
    expectedGoalsAway: Math.round((awayStrength / 100) * 2.5 * 10) / 10,
    recentForm: recentResults,
  };
}

// Full post-match report
export function computePostMatchReport(
  liveMatch: LiveMatch,
  homeTeam: Team,
  awayTeam: Team,
): PostMatchReport {
  const events = liveMatch.events;
  const homeStats = computeTeamStats(events, homeTeam.id, awayTeam.id, FULL_TIME_MINUTE);
  const awayStats = computeTeamStats(events, awayTeam.id, homeTeam.id, FULL_TIME_MINUTE);
  const possession = computePossession(homeTeam, awayTeam, liveMatch.homeApproach, liveMatch.awayApproach, FULL_TIME_MINUTE);
  homeStats.possession = possession.home;
  awayStats.possession = possession.away;

  const homeRatings = computePlayerRatings(events, homeTeam, FULL_TIME_MINUTE);
  const awayRatings = computePlayerRatings(events, awayTeam, FULL_TIME_MINUTE);
  const allRatings = [...homeRatings, ...awayRatings];
  const manOfTheMatch = allRatings.length > 0
    ? allRatings.reduce((best, current) => current.rating > best.rating ? current : best)
    : null;

  return {
    match: liveMatch.match,
    homeStats,
    awayStats,
    homeRatings: homeRatings.sort((a, b) => b.rating - a.rating),
    awayRatings: awayRatings.sort((a, b) => b.rating - a.rating),
    manOfTheMatch,
    homeApproach: liveMatch.homeApproach,
    awayApproach: liveMatch.awayApproach,
    events,
  };
}
