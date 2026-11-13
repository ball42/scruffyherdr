// Herdr keeps a layout's clicks (panel sizes, hidden panels, theme pick) in
// layouts/.state/<name>.json. These pure helpers read that state and carry it
// onto a new layout tree.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function readClicks(text) {
  const out = { nodes: {}, theme: null };
  let j;
  try { j = JSON.parse(text); } catch { return out; }
  if (!isObj(j)) return out;
  if (isObj(j.nodes)) {
    for (const [id, v] of Object.entries(j.nodes)) if (isObj(v)) out.nodes[id] = v;
  }
  if (isObj(j.theme)) out.theme = j.theme;
  return out;
}

export function keepClicks(tree, nodes) {
  const walk = (n) => {
    const c = { ...n };
    const kept = isObj(nodes) && Object.prototype.hasOwnProperty.call(nodes, n.id) ? nodes[n.id] : null;
    if (isObj(kept)) for (const [k, v] of Object.entries(kept)) c[k] = JSON.parse(JSON.stringify(v));
    if (Array.isArray(n.children)) c.children = n.children.map(walk);
    return c;
  };
  return walk(tree);
}

export function missingIds(tree, nodes) {
  const have = new Set();
  const walk = (n) => { have.add(n.id); (n.children || []).forEach(walk); };
  walk(tree);
  return Object.keys(nodes || {}).filter((id) => !have.has(id));
}
