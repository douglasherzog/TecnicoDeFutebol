import type { PitchCoord, PlayerOnPitch, PlayAction } from '../pitchEngine';

/** Estados individuais de cada jogador durante a partida. */
export type PlayerAIState =
  | 'positioning' // sem bola, assumindo posição tática
  | 'marking' // marcando um adversário próximo
  | 'pressing' // pressionando quem tem a bola
  | 'covering' // cobrindo espaço defensivamente
  | 'supporting' // oferecendo opção de passe
  | 'making_run' // fazendo corrida desmarcada
  | 'ball_seeking' // indo buscar a bola
  | 'carrying' // conduzindo a bola
  | 'dribbling' // driblando
  | 'passing' // em ação de passe
  | 'shooting' // finalizando
  | 'clearing' // afastando perigo
  | 'saving' // goleiro defendendo
  | 'goalkeeping' // goleiro posicionado na área
  | 'contesting_header'; // disputando bola aérea após cruzamento

/** Fase coletiva do time no momento. */
export type TeamPhase =
  | 'attacking_organized'
  | 'attacking_transition'
  | 'defending_organized'
  | 'defending_transition'
  | 'dead_ball';

/** Estilo tático do time: influencia prudência e agressividade. */
export interface TacticalStyle {
  name: string;
  /** Quanto o time sobe linhas no ataque (0-1). */
  attackingWidth: number;
  /** Quanto o time pressiona ao perder a bola (0-1). */
  pressing: number;
  /** Quanto o time recua para defender (0-1). */
  compactness: number;
  /** Inclinação para arriscar passes/chutes (0-1). */
  riskTaking: number;
  /** Preferência por velocidade no contra-ataque (0-1). */
  counterAttack: number;
}

/** Atributos táticos de um jogador. */
export interface PlayerAttributes {
  technique: number; // 0-100
  passing: number;
  vision: number;
  speed: number;
  strength: number;
  tackling: number;
  composure: number;
  energy: number; // cansaço 0-100
}

/** Jogador enriquecido com IA. */
export interface TacticalPlayer extends PlayerOnPitch {
  attributes: PlayerAttributes;
  state: PlayerAIState;
  targetPos: PitchCoord;
  velocity: PitchCoord;
  cooldown: number; // ticks até poder agir novamente
  markedBy?: string; // playerId do marcador (se houver)
}

/** Decisão que um jogador pode tomar com a bola. */
export interface DecisionOption {
  action: PlayAction;
  targetId: string | null; // jogador alvo, se houver
  ballTo: PitchCoord;
  score: number;
  description: string;
}

/** Configurações táticas do simulador. */
export interface TacticalConfig {
  /** Ticks de lógica por minuto simulado. */
  ticksPerMinute: number;
  /** Distância máxima considerada "perto" (pitch coords). */
  nearbyDistance: number;
  /** Distância máxima para uma finalização confortável. */
  shootingDistance: number;
  /** Fator de aleatoriedade nas decisões (0-1). */
  randomness: number;
  /** Velocidade base de deslocamento dos jogadores. */
  moveSpeed: number;
  /** Fator de erro de execução (0-1). */
  executionError: number;
  /** Distância mínima considerada um "passe útil" (evita toques sem progresso). */
  idealPassMin: number;
  /** Distância máxima ideal de passe (acima disso vira lançamento arriscado). */
  idealPassMax: number;
  /** Bônus para manter a posse de bola com passes curtos e seguros. */
  buildUpBonus: number;
  /** Distância ideal entre linhas (defesa, meio, ataque) para manter bloco coeso. */
  lineSpacing: number;
}

export const DEFAULT_TACTICAL_CONFIG: TacticalConfig = {
  ticksPerMinute: 60,
  nearbyDistance: 12,
  shootingDistance: 22,
  randomness: 0.25,
  moveSpeed: 2.2,
  executionError: 0.18,
  idealPassMin: 5,
  idealPassMax: 16,
  buildUpBonus: 8,
  lineSpacing: 10,
};

/** Estado interno de um time durante a simulação. */
export interface TeamState {
  players: TacticalPlayer[];
  isHome: boolean;
  style: TacticalStyle;
  phase: TeamPhase;
  hasPossession: boolean;
  lastPhase: TeamPhase;
  goals: number;
}
