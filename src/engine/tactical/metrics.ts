import type { PitchCoord } from '../pitchEngine';
import type { TacticalPlayer, TeamState } from './types';
import * as I from '../interpolation';

export interface SimulationMetrics {
  totalPossessions: number;
  avgPassesPerPossession: number;
  possessionTicks: { home: number; away: number };
  ballZoneDistribution: {
    home: { defense: number; midfield: number; attack: number };
    away: { defense: number; midfield: number; attack: number };
  };
  avgLineDistances: { def_mid: number; mid_att: number; def_att: number };
  maxClusterSize: number;
  longShots: number;
  zoneShots: number;
  shortPasses: number;
  longPasses: number;
  crosses: number;
  headers: number;
  headersWon: number;
  totalActions: number;
}

export function createEmptyMetrics(): SimulationMetrics {
  return {
    totalPossessions: 0, avgPassesPerPossession: 0,
    possessionTicks: { home: 0, away: 0 },
    ballZoneDistribution: {
      home: { defense: 0, midfield: 0, attack: 0 },
      away: { defense: 0, midfield: 0, attack: 0 },
    },
    avgLineDistances: { def_mid: 0, mid_att: 0, def_att: 0 },
    maxClusterSize: 0, longShots: 0, zoneShots: 0,
    shortPasses: 0, longPasses: 0, crosses: 0, headers: 0, headersWon: 0, totalActions: 0,
  };
}

export class MetricsCollector {
  private m: SimulationMetrics = createEmptyMetrics();
  private currentTeam: 'home' | 'away' | null = null;
  private currentPasses = 0;
  private passCounts: number[] = [];
  private lineSamples: { def_mid: number; mid_att: number; def_att: number }[] = [];
  private zoneSamples = { home: { d: 0, m: 0, a: 0 }, away: { d: 0, m: 0, a: 0 } };
  private zoneTotal = { home: 0, away: 0 };

  recordTick(ball: PitchCoord, home: TeamState, away: TeamState) {
    if (home.hasPossession) {
      this.m.possessionTicks.home++;
      this.recordZone(ball, 'home', home.isHome);
    } else if (away.hasPossession) {
      this.m.possessionTicks.away++;
      this.recordZone(ball, 'away', away.isHome);
    }
    const lines = this.computeLines(home);
    if (lines) this.lineSamples.push(lines);
    const cluster = this.computeCluster(home, away);
    if (cluster > this.m.maxClusterSize) this.m.maxClusterSize = cluster;
  }

  recordPossessionChange(newTeam: 'home' | 'away') {
    if (this.currentTeam !== null && this.currentPasses > 0) {
      this.passCounts.push(this.currentPasses);
    }
    this.currentTeam = newTeam;
    this.currentPasses = 0;
    this.m.totalPossessions++;
  }

  recordAction(action: string, ballFrom: PitchCoord, isHome: boolean, passDist?: number, cfg?: { idealPassMin: number; idealPassMax: number }) {
    this.m.totalActions++;
    if (action === 'shot') {
      const inZone = isHome ? ballFrom.x > 70 : ballFrom.x < 30;
      if (inZone) this.m.zoneShots++; else this.m.longShots++;
    }
    if (action === 'cross') {
      this.m.crosses++;
      this.currentPasses++;
    } else if (action === 'pass' || action === 'long_pass') {
      this.currentPasses++;
      if (passDist !== undefined && cfg) {
        if (passDist >= cfg.idealPassMin && passDist <= cfg.idealPassMax) this.m.shortPasses++;
        else if (passDist > cfg.idealPassMax) this.m.longPasses++;
      }
    }
    if (action === 'header') {
      this.m.headers++;
    }
  }

  recordHeaderWon() {
    this.m.headersWon++;
  }

  finalize(): SimulationMetrics {
    if (this.currentTeam !== null && this.currentPasses > 0) {
      this.passCounts.push(this.currentPasses);
    }
    if (this.passCounts.length > 0) {
      this.m.avgPassesPerPossession = this.passCounts.reduce((s, v) => s + v, 0) / this.passCounts.length;
    }
    if (this.lineSamples.length > 0) {
      const avg = this.lineSamples.reduce((acc, s) => ({
        def_mid: acc.def_mid + s.def_mid, mid_att: acc.mid_att + s.mid_att, def_att: acc.def_att + s.def_att,
      }), { def_mid: 0, mid_att: 0, def_att: 0 });
      this.m.avgLineDistances = {
        def_mid: avg.def_mid / this.lineSamples.length,
        mid_att: avg.mid_att / this.lineSamples.length,
        def_att: avg.def_att / this.lineSamples.length,
      };
    }
    for (const team of ['home', 'away'] as const) {
      const total = this.zoneTotal[team];
      if (total > 0) {
        this.m.ballZoneDistribution[team] = {
          defense: this.zoneSamples[team].d / total,
          midfield: this.zoneSamples[team].m / total,
          attack: this.zoneSamples[team].a / total,
        };
      }
    }
    return { ...this.m };
  }

  private recordZone(ball: PitchCoord, team: 'home' | 'away', isHome: boolean) {
    this.zoneTotal[team]++;
    const inDef = isHome ? ball.x < 33 : ball.x > 67;
    const inAtt = isHome ? ball.x > 67 : ball.x < 33;
    if (inDef) this.zoneSamples[team].d++;
    else if (inAtt) this.zoneSamples[team].a++;
    else this.zoneSamples[team].m++;
  }

  private computeLines(team: TeamState): { def_mid: number; mid_att: number; def_att: number } | null {
    const def = team.players.filter(p => p.position === 'ZAG');
    const mid = team.players.filter(p => p.position === 'VOL' || p.position === 'MEI');
    const att = team.players.filter(p => p.position === 'ATA');
    if (def.length === 0 || mid.length === 0 || att.length === 0) return null;
    const avgX = (players: TacticalPlayer[]) => players.reduce((s, p) => s + p.currentCoord.x, 0) / players.length;
    const dx = avgX(def), mx = avgX(mid), ax = avgX(att);
    return { def_mid: Math.abs(mx - dx), mid_att: Math.abs(ax - mx), def_att: Math.abs(ax - dx) };
  }

  private computeCluster(home: TeamState, away: TeamState): number {
    const all = [...home.players, ...away.players];
    let max = 0;
    for (const a of all) {
      const count = all.filter(b => I.distance(a.currentCoord, b.currentCoord) < 5).length;
      if (count > max) max = count;
    }
    return max;
  }
}
