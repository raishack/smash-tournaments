export interface Roa2Character {
  id: number;
  name: string;
}

export const ROA2_CHARACTERS: Roa2Character[] = [
  { id: 2837, name: "Random" },
  { id: 2499, name: "Zetterburn" },
  { id: 2597, name: "Orcane" },
  { id: 2500, name: "Wrastor" },
  { id: 2504, name: "Kragg" },
  { id: 2599, name: "Forsburn" },
  { id: 2502, name: "Maypul" },
  { id: 2709, name: "Absa" },
  { id: 2615, name: "Etalus" },
  { id: 2501, name: "Ranno" },
  { id: 2503, name: "Clairen" },
  { id: 2619, name: "Olympia" },
  { id: 2498, name: "Fleet" },
  { id: 2505, name: "Loxodont" },
  { id: 2794, name: "Galvan" },
  { id: 2834, name: "La Reina" },
  { id: 2953, name: "Slade" },
];

const byNormalizedName = new Map(
  ROA2_CHARACTERS.map((character) => [normalizeRoa2CharacterName(character.name), character]),
);

export function normalizeRoa2CharacterName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s&.-]/g, "")
    .replace(/\s+/g, " ");
}

export function resolveRoa2Character(value: string): Roa2Character | undefined {
  return byNormalizedName.get(normalizeRoa2CharacterName(value));
}
