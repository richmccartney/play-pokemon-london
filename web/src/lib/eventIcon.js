// Premier events are the ones worth travelling for, so they get a badge that
// makes them stand out from the far more numerous weekly league nights.
// Everything else is deliberately unbadged rather than given a weaker icon,
// so the badge stays a meaningful signal.
const ICONS = [
  { match: /cup/i, icon: "🏆", label: "League Cup" },
  { match: /challenge/i, icon: "🥇", label: "League Challenge" },
];

export function eventIcon(typeLabel) {
  if (!typeLabel) return null;
  return ICONS.find((entry) => entry.match.test(typeLabel)) ?? null;
}
