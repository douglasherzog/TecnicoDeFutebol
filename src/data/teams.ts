// Team base data - squads and budgets are generated at game start
export interface TeamBase {
  id: string;
  name: string;
  shortName: string;
  colors: { primary: string; secondary: string };
}

export const division1Teams: TeamBase[] = [
  { id: 'd1-01', name: 'Estrela Dourada FC', shortName: 'EST', colors: { primary: '#FFD700', secondary: '#1a1a2e' } },
  { id: 'd1-02', name: 'Atlético Trovão', shortName: 'ATT', colors: { primary: '#DC143C', secondary: '#FFFFFF' } },
  { id: 'd1-03', name: 'SC Imperial', shortName: 'IMP', colors: { primary: '#4B0082', secondary: '#FFD700' } },
  { id: 'd1-04', name: 'Leões da Serra', shortName: 'LEO', colors: { primary: '#228B22', secondary: '#FFFFFF' } },
  { id: 'd1-05', name: 'Dragões do Norte', shortName: 'DRA', colors: { primary: '#FF4500', secondary: '#000000' } },
  { id: 'd1-06', name: 'Fênix FC', shortName: 'FEN', colors: { primary: '#FF6347', secondary: '#FFA500' } },
  { id: 'd1-07', name: 'Tubarões Azuis', shortName: 'TUB', colors: { primary: '#1E90FF', secondary: '#FFFFFF' } },
  { id: 'd1-08', name: 'Falcões United', shortName: 'FAL', colors: { primary: '#8B0000', secondary: '#FFD700' } },
  { id: 'd1-09', name: 'Gladiadores EC', shortName: 'GLA', colors: { primary: '#2F4F4F', secondary: '#C0C0C0' } },
  { id: 'd1-10', name: 'Cometas FC', shortName: 'COM', colors: { primary: '#9400D3', secondary: '#FFFFFF' } },
  { id: 'd1-11', name: 'Titãs do Vale', shortName: 'TIT', colors: { primary: '#008080', secondary: '#000000' } },
  { id: 'd1-12', name: 'Relâmpago SC', shortName: 'REL', colors: { primary: '#FFFF00', secondary: '#000080' } },
  { id: 'd1-13', name: 'Guerreiros FC', shortName: 'GUE', colors: { primary: '#A52A2A', secondary: '#FFFFFF' } },
  { id: 'd1-14', name: 'Sparta EC', shortName: 'SPA', colors: { primary: '#800000', secondary: '#FFD700' } },
  { id: 'd1-15', name: 'Olimpo FC', shortName: 'OLI', colors: { primary: '#4169E1', secondary: '#FFFFFF' } },
  { id: 'd1-16', name: 'Vendaval AC', shortName: 'VEN', colors: { primary: '#708090', secondary: '#FFFFFF' } },
  { id: 'd1-17', name: 'Netuno SC', shortName: 'NET', colors: { primary: '#006400', secondary: '#87CEEB' } },
  { id: 'd1-18', name: 'Meteoro EC', shortName: 'MET', colors: { primary: '#FF8C00', secondary: '#000000' } },
];

export const division2Teams: TeamBase[] = [
  { id: 'd2-01', name: 'Corsários FC', shortName: 'COR', colors: { primary: '#000000', secondary: '#FF0000' } },
  { id: 'd2-02', name: 'Vulcão EC', shortName: 'VUL', colors: { primary: '#B22222', secondary: '#FFA500' } },
  { id: 'd2-03', name: 'Pégaso SC', shortName: 'PEG', colors: { primary: '#FFFFFF', secondary: '#87CEEB' } },
  { id: 'd2-04', name: 'Tornado FC', shortName: 'TOR', colors: { primary: '#696969', secondary: '#00FF00' } },
  { id: 'd2-05', name: 'Centauros AC', shortName: 'CEN', colors: { primary: '#8B4513', secondary: '#FFD700' } },
  { id: 'd2-06', name: 'Aço FC', shortName: 'ACO', colors: { primary: '#C0C0C0', secondary: '#000080' } },
  { id: 'd2-07', name: 'Condores EC', shortName: 'CON', colors: { primary: '#556B2F', secondary: '#FFFFFF' } },
  { id: 'd2-08', name: 'Tridente SC', shortName: 'TRI', colors: { primary: '#191970', secondary: '#00CED1' } },
  { id: 'd2-09', name: 'Arsenal do Sul', shortName: 'ARS', colors: { primary: '#FF0000', secondary: '#FFFFFF' } },
  { id: 'd2-10', name: 'Panteras FC', shortName: 'PAN', colors: { primary: '#000000', secondary: '#FFD700' } },
  { id: 'd2-11', name: 'Ciclone EC', shortName: 'CIC', colors: { primary: '#4682B4', secondary: '#FFFFFF' } },
  { id: 'd2-12', name: 'Lobos da Mata', shortName: 'LOB', colors: { primary: '#808080', secondary: '#8B0000' } },
  { id: 'd2-13', name: 'Búfalos SC', shortName: 'BUF', colors: { primary: '#8B4513', secondary: '#000000' } },
  { id: 'd2-14', name: 'Escorpiões FC', shortName: 'ESC', colors: { primary: '#2E8B57', secondary: '#000000' } },
  { id: 'd2-15', name: 'Gaviões AC', shortName: 'GAV', colors: { primary: '#000000', secondary: '#FFFFFF' } },
  { id: 'd2-16', name: 'Piratas EC', shortName: 'PIR', colors: { primary: '#000000', secondary: '#DC143C' } },
  { id: 'd2-17', name: 'Alquimia FC', shortName: 'ALQ', colors: { primary: '#DAA520', secondary: '#4B0082' } },
  { id: 'd2-18', name: 'Rochas SC', shortName: 'ROC', colors: { primary: '#A0522D', secondary: '#FFFFFF' } },
];

export const division3Teams: TeamBase[] = [
  { id: 'd3-01', name: 'Raposas FC', shortName: 'RAP', colors: { primary: '#FF4500', secondary: '#FFFFFF' } },
  { id: 'd3-02', name: 'Trovadores EC', shortName: 'TRV', colors: { primary: '#6A5ACD', secondary: '#FFFFFF' } },
  { id: 'd3-03', name: 'Furacão SC', shortName: 'FUR', colors: { primary: '#2F4F4F', secondary: '#FF6347' } },
  { id: 'd3-04', name: 'Matilha AC', shortName: 'MAT', colors: { primary: '#696969', secondary: '#FFD700' } },
  { id: 'd3-05', name: 'Valentes FC', shortName: 'VAL', colors: { primary: '#B8860B', secondary: '#000000' } },
  { id: 'd3-06', name: 'Corujas EC', shortName: 'CRJ', colors: { primary: '#4B0082', secondary: '#C0C0C0' } },
  { id: 'd3-07', name: 'Tigres do Oeste', shortName: 'TIG', colors: { primary: '#FF8C00', secondary: '#000000' } },
  { id: 'd3-08', name: 'Bravos SC', shortName: 'BRA', colors: { primary: '#DC143C', secondary: '#FFFFFF' } },
  { id: 'd3-09', name: 'Jaguares FC', shortName: 'JAG', colors: { primary: '#FFD700', secondary: '#000000' } },
  { id: 'd3-10', name: 'Sentinelas EC', shortName: 'SEN', colors: { primary: '#000080', secondary: '#C0C0C0' } },
  { id: 'd3-11', name: 'Foguetes AC', shortName: 'FOG', colors: { primary: '#FF0000', secondary: '#FFFF00' } },
  { id: 'd3-12', name: 'Corvos SC', shortName: 'CRV', colors: { primary: '#000000', secondary: '#4B0082' } },
  { id: 'd3-13', name: 'Minotauros FC', shortName: 'MIN', colors: { primary: '#8B0000', secondary: '#A52A2A' } },
  { id: 'd3-14', name: 'Legiões EC', shortName: 'LEG', colors: { primary: '#556B2F', secondary: '#FFD700' } },
  { id: 'd3-15', name: 'Vikingas SC', shortName: 'VIK', colors: { primary: '#4682B4', secondary: '#FFFFFF' } },
  { id: 'd3-16', name: 'Javalis AC', shortName: 'JAV', colors: { primary: '#8B4513', secondary: '#228B22' } },
  { id: 'd3-17', name: 'Templários FC', shortName: 'TEM', colors: { primary: '#FFFFFF', secondary: '#DC143C' } },
  { id: 'd3-18', name: 'Abutres EC', shortName: 'ABU', colors: { primary: '#2F4F4F', secondary: '#000000' } },
];
