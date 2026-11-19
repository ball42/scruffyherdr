// Colour maths for the kit's state colours: how a colour reads with
// deuteranopia, how far apart two colours look (CIEDE2000), WCAG contrast,
// and a blend. Pure; colours are "#rrggbb" strings.

/** The kit's done colour, per mode. */
export const DONE = { dark: "#58a6ff", light: "#0969da" };

// Machado, Oliveira and Fernandes (2009), deuteranopia at severity 1.0, on linear RGB.
const DEUTAN = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.011820, 0.042940, 0.968881],
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const parse = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (lin) => "#" + lin.map((c) => Math.round(clamp01(toSrgb(clamp01(c))) * 255).toString(16).padStart(2, "0")).join("");
const linear = (h) => parse(h).map(toLinear);

/** How `hex` looks to someone with deuteranopia. */
export function deuteranope(h) {
  const l = linear(h);
  return hex(DEUTAN.map((row) => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
}

function lab(h) {
  const [r, g, b] = linear(h);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => ((r * 180) / Math.PI + 360) % 360;

/** CIEDE2000 between two Lab triples (kL = kC = kH = 1). */
export function deltaELab([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1 = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p));
  const h2 = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p));
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hb = (h1 + h2) / 2;
    else hb = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Cbp7 = Cbp ** 7;
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** How far apart two colours look (CIEDE2000). */
export function deltaE(a, b) {
  return deltaELab(lab(a), lab(b));
}

/** How far apart two colours look with deuteranopia. */
export function deltaESim(a, b) {
  return deltaE(deuteranope(a), deuteranope(b));
}

const luminance = (h) => {
  const [r, g, b] = linear(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A blend from `a` (t = 0) to `b` (t = 1) in linear RGB; t is clamped. */
export function mix(a, b, t) {
  const k = clamp01(t);
  const la = linear(a), lb = linear(b);
  return hex(la.map((c, i) => c + (lb[i] - c) * k));
}
