# Técnico de Futebol

Jogo de gestão de futebol desenvolvido com React, TypeScript e Vite. Assuma um clube da terceira divisão, monte o elenco e busque promoções, títulos e sustentabilidade financeira.

## Recursos

- Três divisões com promoção e rebaixamento.
- Simulação de partidas com escalação, formação, tática, moral e condicionamento físico.
- Mercado com agentes livres, transferências entre clubes, vendas e renovação de contratos.
- Finanças por partida, folha salarial, cotas de TV e premiações.
- Copa Nacional eliminatória, calendário da liga e objetivo de temporada.
- Salvamento automático da carreira no armazenamento local do navegador.

### Motor de Partida Ao Vivo

- **Pré-análise**: força relativa, probabilidade de resultado, gols esperados e forma recente antes do apito inicial.
- **Narração contextual**: o texto dos lances reage ao placar, ao minuto do jogo e ao estilo do comentarista (técnico, passional ou neutro).
- **Eventos especiais**: cartões vermelhos, pênaltis (convertidos e perdidos), lesões e gols contra.
- **Estatísticas em tempo real**: posse de bola, finalizações, xG, faltas, cartões e momentum.
- **Medidor de tensão**: sobe com gols tardios, cartões vermelhos, pênaltis e lances dramáticos.
- **Linha do tempo visual**: barra 0'→90' com marcadores clicáveis para gols, cartões, substituições e eventos especiais.
- **Ratings individuais (0–10)**: cada jogador recebe nota em tempo real conforme participação nos lances.
- **Animação de gol**: flash visual "GOAL!" ao marcar.
- **Destaques do jogador**: sidebar com os lances-chave do time do usuário.
- **Classificação ao vivo**: projeção de pontos e posição durante a partida.
- **Substituições ao vivo**: até 3 trocas com efeito imediato na simulação.
- **Instruções táticas rápidas**: muda postura (defensiva, equilibrada, ofensiva) com regeneração imediata.
- **Campo 2D esquemático**: posição da bola e indicadores de ataque.
- **Campo animado com jogadores**: visualização fluida com 22 jogadores como bolinhas coloridas por time, bola se movendo entre jogadores com passes, cruzamentos, dribles, finalizações e narração play-by-play em tempo real.
- **Relatório pós-partida completo**: tela dedicada com estatísticas finais, notas de todos os jogadores, craque da partida e táticas usadas.

## Stack

- React 19
- TypeScript
- Vite
- Zustand
- Tailwind CSS
- Vitest
- Oxlint

## Como executar

```bash
npm install
npm run dev
```

## Comandos

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run preview
```

## Estrutura

- `src/components`: telas e componentes de interface.
- `src/engine`: regras puras de simulação, finanças, elenco, transferências e copa.
- `src/store`: estado da carreira e ações de jogo.
- `src/data`: clubes e nomes gerados.
- `src/types.ts`: contratos de dados compartilhados.

## Qualidade

O pipeline em GitHub Actions executa lint, testes e build para pushes e pull requests. Os testes automatizados cobrem os engines de calendário, partidas, finanças, elenco, transferências e copa.

## Salvamento

A carreira é persistida automaticamente no `localStorage` com a chave `tecnico-de-futebol-career`. Limpar os dados do site apaga a carreira salva.
