const PALETTE = [
  "#0F766E",
  "#B45309",
  "#1D4ED8",
  "#BE123C",
  "#047857",
  "#7C3AED",
  "#C2410C",
  "#0369A1",
];

export function colorForUsername(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
