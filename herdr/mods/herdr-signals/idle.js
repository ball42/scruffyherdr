// Seconds since the last keyboard/mouse input, from `ioreg -c IOHIDSystem` text.
export function parseHidIdleSeconds(ioregText) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(ioregText);
  return m ? Number(m[1]) / 1e9 : null;
}
