# Relatório de Auditoria Técnica — Engine de Simulação de Futebol 2D

## 1. Causas das Instabilidades Anteriores

### 1.1. Fonte Dupla de Posicionamento (CAUSA RAIZ)
- **Problema**: Existiam dois sistemas independentes calculando posições de jogadores:
  1. **Sistema tático** (`ai.ts` + `minuteSimulator.ts`): usava `computeTacticalTarget()` com zonas, fases, offsets por estilo e coesão de linhas.
  2. **Sistema visual** (`matchSimulation.ts`): usava `playerTarget()` com `ROLE_SHIFT` — uma atração linear pela bola, ignorando fases, zonas e estilo tático.
- **Sintoma**: Os jogadores se moviam para posições completamente diferentes das táticas durante a animação, causando aglomeração visual e perda de estrutura.

### 1.2. Efeito "Pinball" da Bola
- **Problema**: Chutes longos fora da zona de finalização tinham a mesma chance de sucesso que chutes de dentro da área.
- **Sintoma**: A bola trocava de posse rapidamente entre os times sem construção de jogada.

### 1.3. Falta de Coesão entre Linhas
- **Problema**: Sem limite de afastamento entre defesa/meio/ataque, cada linha se movia independentemente.
- **Sintoma**: Blocos defensivos e ofensivos separados por grandes vazios, facilitando passes longos e quebrando o bloco tático.

### 1.4. Aglomeração de Jogadores
- **Problema**: Não havia limite de quantos jogadores podiam ir buscar a bola simultaneamente.
- **Sintoma**: 5-6 jogadores de um time convergiam para a bola, deixando o resto do campo vazio.

---

## 2. Correções Estruturais Aplicadas

### 2.1. Unificação do Posicionamento (CORREÇÃO PRINCIPAL)
- **Arquivo**: `src/engine/matchSimulation.ts`
- **Mudança**: Removido `playerTarget()` e `keeperTarget()` locais com `ROLE_SHIFT`. O sistema visual agora usa `computeTacticalTarget()` e `computeKeeperTarget()` importados de `ai.ts`.
- **Impacto**: Existe agora **uma única fonte de verdade** para posicionamento de jogadores. O que a simulação tática calcula é o que a animação mostra.
- **Como**: `MatchSimulation` agora recebe `homeApproach` e `awayApproach` no construtor, constrói objetos `TeamState`, e atualiza fases via `detectTeamPhase()` a cada tick visual.

### 2.2. Sistema de Métricas Objetivas
- **Arquivo novo**: `src/engine/tactical/metrics.ts`
- **Métricas coletadas**:
  - `totalPossessions` e `avgPassesPerPossession` — qualidade de construção
  - `possessionTicks` — posse por time
  - `ballZoneDistribution` — distribuição da bola por terço (defesa/meio/ataque)
  - `avgLineDistances` — distância entre linhas táticas
  - `maxClusterSize` — maior aglomerado de jogadores
  - `longShots` vs `zoneShots` — qualidade das finalizações
  - `shortPasses` vs `longPasses` — estilo de jogo
- **Função**: `simulateMinuteWithMetrics()` em `minuteSimulator.ts` integra a coleta ao loop de simulação.

### 2.3. Checklist de Sanidade Tática
- **Arquivo novo**: `src/engine/tactical/tacticalSanity.test.ts`
- **5 testes validados**:
  1. Aglomerado máximo ≤ 6 jogadores em raio de 5 unidades
  2. Distância entre linhas entre 5 e 45 unidades
  3. Pelo menos 1 ação registrada por minuto
  4. Máximo 3 chutes longos por minuto
  5. Posse distribuída entre os dois times (nenhum com >90%)

### 2.4. Penalização de Chutes Longos (sessão anterior)
- **Arquivo**: `src/engine/tactical/ai.ts` — `scoreOnBallDecision()`
- Chutes fora do terço final recebem penalidade drástica no score.
- Passe curto na faixa ideal (5-16 unidades) recebe bônus de construção.
- Condução valorizada quando há espaço e pouca pressão.

### 2.5. Coesão de Linhas (sessão anterior)
- **Arquivo**: `src/engine/tactical/minuteSimulator.ts` — `cohesiveLines()`
- Limita afastamento entre linhas adjacentes baseado em `cfg.lineSpacing`.
- Goleiro não pode ficar à frente de zagueiros; atacantes não podem ficar atrás do meio.

### 2.6. Limite de Perseguidores da Bola (sessão anterior)
- **Arquivo**: `src/engine/tactical/minuteSimulator.ts` — `ballChasers()`
- Máximo 3 jogadores por time podem ativamente perseguir a bola.

---

## 3. Arquitetura Unificada (Estado Final)

```
minuteSimulator.ts          matchSimulation.ts          PitchAnimation.tsx
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ simulateMinute()│        │ MatchSimulation   │        │ Component React   │
│                 │        │                   │        │                   │
│ TeamState       │        │ TeamState         │        │ Passa approach    │
│  players[]      │        │  players[]        │        │ para MatchSim     │
│  phase          │        │  phase            │        │                   │
│  style          │        │  style            │        │ rAF loop          │
│  hasPossession  │        │  hasPossession    │        │  tick()           │
│                 │        │                   │        │  render(alpha)    │
│ simulateOneTick │        │ updateBallAnd...  │        │                   │
│  prepareTargets │───────▶│  computeTactical  │        │ SVG refs          │
│  cohesiveLines  │  usa   │  Target()         │        │  ball, players    │
│  ballChasers    │  mesma │  computeKeeper    │        │  trail, flashes   │
│  decisions      │  fonte │  Target()         │        │                   │
│  duels          │        │  detectTeamPhase()│        │                   │
└─────────────────┘        └──────────────────┘        └──────────────────┘
         │                          │
         ▼                          ▼
    ai.ts (fonte única)       ai.ts (mesma fonte)
    computeTacticalTarget     computeTacticalTarget
    computeKeeperTarget       computeKeeperTarget
    detectTeamPhase           detectTeamPhase
    scoreOnBallDecision       (não usa — só tático)
    transitionPlayerState     (não usa — só tático)
```

---

## 4. Localização dos Parâmetros de Estilo

### 4.1. Configuração Tática Geral
- **Arquivo**: `src/engine/tactical/types.ts` → `DEFAULT_TACTICAL_CONFIG`
- **Parâmetros**:
  - `ticksPerMinute`: 40 — densidade de simulação por minuto
  - `idealPassMin`: 5 — distância mínima de passe útil
  - `idealPassMax`: 16 — distância máxima de passe "curto" (acima = lançamento arriscado)
  - `buildUpBonus`: 8 — bônus para passes curtos seguros no scoring
  - `lineSpacing`: 12 — distância ideal entre linhas para coesão
  - `shootingDistance`: 22 — distância máxima para finalização confortável
  - `randomness`: 0.25 — fator de aleatoriedade nas decisões
  - `moveSpeed`: 2.2 — velocidade base de deslocamento
  - `executionError`: 0.18 — fator de erro de execução

### 4.2. Estilos Táticos
- **Arquivo**: `src/engine/tactical/minuteSimulator.ts` → `styleFromApproach()`
- **Parâmetros por estilo**:
  - `attackingWidth`: quanto as laterais se abrem no ataque (0-1)
  - `pressing`: intensidade de pressão ao perder a bola (0-1)
  - `compactness`: quanto o time recua para defender (0-1)
  - `riskTaking`: inclinação para passes/chutes arriscados (0-1)
  - `counterAttack`: velocidade de transição ofensiva (0-1)

### 4.3. Zonas e Limites por Posição
- **Arquivo**: `src/engine/tactical/ai.ts` → `ROLE_ZONE_LIMITS`
- **Parâmetros**: `maxForward`, `maxBack`, `maxLateral` por posição (GOL, ZAG, LAT, VOL, MEI, ATA)

### 4.4. Offsets por Fase
- **Arquivo**: `src/engine/tactical/ai.ts` → `rolePhaseOffset()`
- Define quanto cada posição avança/recua em cada fase (ataque organizado, transição, defesa organizada, transição defensiva)

### 4.5. Configuração Visual
- **Arquivo**: `src/engine/matchSimulation.ts` → `SIMULATION_CONFIG`
- **Parâmetros**: `TICK_RATE` (12), `Y_SCALE` (0.64), `ROLE_SPEED` (velocidade por posição), `BALL_BASE_RADIUS`, `CURVE_FACTOR`

---

## 5. Guia para Ajustes Futuros

### Como tornar o jogo mais posse de bola:
- Aumentar `buildUpBonus` (ex: 8 → 12)
- Aumentar `idealPassMax` (ex: 16 → 20)
- Reduzir `randomness` (ex: 0.25 → 0.15)

### Como tornar o jogo mais direto (contra-ataque):
- Reduzir `buildUpBonus` (ex: 8 → 4)
- Reduzir `idealPassMax` (ex: 16 → 12)
- Aumentar `counterAttack` no estilo tático

### Como ajustar compactação defensiva:
- Reduzir `lineSpacing` (ex: 12 → 8) para linhas mais próximas
- Aumentar `compactness` no estilo tático para recuo maior

### Como ajustar pressão:
- Aumentar `pressing` no estilo tático
- Reduzir `maxForward` dos zagueiros em `ROLE_ZONE_LIMITS` para manter defesa alta

---

## 6. Validação

- **TypeScript**: `tsc --noEmit` — sem erros
- **Testes**: 28 testes passando (23 existentes + 5 novos de sanidade tática)
- **Build**: `vite build` — sucesso, 331KB gzipped 98KB
