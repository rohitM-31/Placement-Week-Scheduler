// Small deterministic PRNG (mulberry32) so a given seed always reproduces
// the same dataset — useful for the defense session ("regenerate the exact
// same 35/800/20 dataset you showed us yesterday").
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  // inclusive
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(rng, min, max, decimals = 2) {
  const v = rng() * (max - min) + min;
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

export function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

export function pickN(rng, arr, n) {
  const copy = [...arr];
  const out = [];
  n = Math.min(n, copy.length);
  for (let i = 0; i < n; i++) {
    const idx = randInt(rng, 0, copy.length - 1);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

// Weighted pick: weights.length === arr.length
export function weightedPick(rng, arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// Approximate normal via sum of uniforms (Irwin-Hall / CLT), clipped.
export function randNormal(rng, mean, std, min, max) {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += rng();
  const z = (sum - 3) / Math.sqrt(0.5); // approx standard normal
  let v = mean + z * std;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}
