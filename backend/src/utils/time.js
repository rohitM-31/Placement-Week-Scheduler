export function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHHMM(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(min % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}`;
}

export function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}
