/* ============================================================
   LA CUEVA · personajes pixel art generados por parámetros
   Marco de 48×48, pies en y=45. Cuatro orientaciones (O = E espejado).
   ============================================================ */
const FR = 48, FEET = 45, OY = 2;
const POSES = ['stand-S', 'stand-N', 'stand-E', 'walk-S', 'walk-N', 'walk-E', 'sit-N', 'sit-S', 'sit-E'];

const SKINS = ['#f3cfb0', '#e7b48c', '#c98d63', '#a26b45', '#74452b', '#f8dcc4'];
const HAIRS = ['#1c1410', '#3b2415', '#5e3b1f', '#8f5a2a', '#c79b45', '#cfcfca', '#7a2433', '#28305b', '#e0b36a', '#4a4a4a'];

function cpal(P) {
  return {
    sk: P.skin, sks: shade(P.skin, -.16), skh: shade(P.skin, .1),
    hr: P.hair, hrs: shade(P.hair, -.24), hrh: shade(P.hair, .2),
    tp: P.top, tps: shade(P.top, -.2), tph: shade(P.top, .13),
    pn: P.pants, pns: shade(P.pants, -.22),
    sh: P.shoes, shs: shade(P.shoes, -.28),
    bd: P.badge || '#efe5d5', hat: P.hatC || '#344c3d'
  };
}
const EYE = '#2a1b14';

/* ---------- FRENTE ---------- */
function legsFront(g, c, lL, lR) {
  const leg = (x, l) => {
    g.r(x, 32, 6, 9 + l, c.pn); g.r(x + 5, 32, 1, 9 + l, c.pns); g.r(x, 32, 6, 2, c.pns);
    g.r(x - 1, 40 + l, 7, 3, c.sh); g.r(x - 1, 42 + l, 7, 1, c.shs); g.p(x - 1, 40 + l, shade(c.sh, .25));
  };
  leg(18, lL); leg(24, lR);
}
function torsoFront(g, c, P, dy) {
  const x = 17, y = 20 + dy, w = 14, h = 13;
  g.rr(x, y, w, h, 1, c.tp);
  g.r(x + w - 2, y + 1, 2, h - 2, c.tps); g.r(x, y + h - 1, w, 1, c.tps); g.r(x + 1, y, w - 3, 1, c.tph);
  switch (P.ts) {
    case 'hoodie': g.rr(18, y - 1, 12, 4, 2, c.tps); g.r(21, y + 3, 1, 5, c.tph); g.r(26, y + 3, 1, 5, c.tph); g.r(19, y + 9, 10, 1, c.tps); g.r(19, y + 9, 1, 3, c.tps); g.r(28, y + 9, 1, 3, c.tps); break;
    case 'shirt': g.r(21, y, 6, 2, '#f5eee0'); g.p(21, y + 2, '#f5eee0'); g.p(26, y + 2, '#f5eee0'); g.r(23, y + 2, 2, h - 3, shade(c.tp, .16)); for (let i = 0; i < 3; i++) g.p(23, y + 4 + i * 3, c.tps); break;
    case 'blazer': g.r(21, y, 6, 6, '#f5eee0'); for (let i = 0; i < 6; i++) { g.p(20 + i, y + i, c.tps); g.p(27 - i, y + i, c.tps); } g.r(23, y + 6, 2, 7, c.tps); g.p(23, y + 8, '#d9bb6e'); g.p(23, y + 11, '#d9bb6e'); break;
    case 'sweater': g.r(x, y + h - 3, w, 3, shade(c.tp, .12)); g.r(20, y, 8, 1, c.tps); break;
    case 'turtle': g.r(20, y - 2, 8, 3, c.tp); g.r(20, y - 2, 8, 1, c.tph); g.r(27, y - 1, 1, 2, c.tps); break;
    case 'vest': g.r(x, y, 3, h, shade(c.tp, .22)); g.r(x + w - 3, y, 3, h, shade(c.tp, .22)); g.r(23, y + 1, 2, h - 2, c.tps); break;
    default: g.r(21, y, 6, 1, c.tps);
  }
  g.r(26, y + 4, 3, 3, c.bd); g.p(26, y + 4, shade(c.bd, .35)); g.p(28, y + 6, shade(c.bd, -.2));
}
function armsFront(g, c, P, dy, aL, aR) {
  const long = P.ts !== 'tee';
  const arm = (x, ady, right) => {
    const y = 21 + dy + ady, sl = long ? 8 : 4;
    g.rr(x, y, 4, sl, 1, c.tp); g.r(right ? x + 3 : x, y, 1, sl, c.tps);
    g.r(x, y + sl, 4, 12 - sl, c.sk); g.r(right ? x + 3 : x, y + sl, 1, 12 - sl, c.sks);
    g.r(x, y + 10, 4, 2, c.sk);
    if (long) g.r(x, y + sl - 1, 4, 1, shade(c.tp, -.3));
  };
  arm(13, aL, false); arm(31, aR, true);
}
function headFront(g, c, P, dy) {
  const y = 4 + dy;
  g.rr(16, y, 16, 15, 3, c.sk);
  g.r(30, y + 4, 2, 9, c.sks); g.r(17, y + 14, 14, 1, c.sks);
  g.r(14, y + 6, 2, 4, c.sk); g.r(32, y + 6, 2, 4, c.sk); g.p(15, y + 8, c.sks); g.p(32, y + 8, c.sks);   // orejas
  g.r(19, y + 6, 2, 3, EYE); g.r(27, y + 6, 2, 3, EYE); g.p(19, y + 6, '#ffffff'); g.p(27, y + 6, '#ffffff');
  g.r(23, y + 8, 2, 1, c.sks);
  g.r(17, y + 10, 2, 1, 'rgba(214,110,100,.55)'); g.r(29, y + 10, 2, 1, 'rgba(214,110,100,.55)');
  g.r(22, y + 12, 4, 1, '#8c4a3b'); g.p(21, y + 11, '#8c4a3b'); g.p(26, y + 11, '#8c4a3b');
  if (P.face === 'beard') { g.rr(17, y + 8, 14, 7, 3, c.hrs); g.r(21, y + 8, 6, 2, c.hrs); g.r(22, y + 12, 4, 1, '#6d352b'); g.r(22, y + 11, 4, 1, c.sk); g.r(23, y + 8, 2, 1, c.sks); }
  if (P.face === 'stache') { g.r(20, y + 10, 8, 1, c.hrs); g.r(19, y + 11, 2, 1, c.hrs); g.r(27, y + 11, 2, 1, c.hrs); }
  if (P.face === 'stubble') { for (let i = 0; i < 9; i++) g.p(18 + ((i * 5) % 12), y + 11 + (i % 3), shade(c.sk, -.28)); }
  if (P.acc === 'glasses') { const f = '#2a1b14'; g.r(17, y + 5, 6, 1, f); g.r(17, y + 9, 6, 1, f); g.r(17, y + 5, 1, 5, f); g.r(22, y + 5, 1, 5, f); g.r(25, y + 5, 6, 1, f); g.r(25, y + 9, 6, 1, f); g.r(25, y + 5, 1, 5, f); g.r(30, y + 5, 1, 5, f); g.r(23, y + 6, 2, 1, f); g.r(18, y + 6, 4, 3, 'rgba(190,225,240,.32)'); g.r(26, y + 6, 4, 3, 'rgba(190,225,240,.32)'); }
  if (P.acc === 'phones') { const b = shade(c.bd, -.4); g.r(14, y - 3, 1, 9, b); g.r(33, y - 3, 1, 9, b); g.r(15, y - 4, 18, 1, b); g.r(13, y + 5, 3, 6, c.bd); g.r(32, y + 5, 3, 6, c.bd); g.r(13, y + 5, 1, 6, shade(c.bd, -.3)); g.r(34, y + 5, 1, 6, shade(c.bd, -.3)); }
  if (P.acc === 'shades') { const f = '#16100c'; g.r(17, y + 5, 6, 4, f); g.r(25, y + 5, 6, 4, f); g.r(23, y + 6, 2, 1, f); g.r(18, y + 6, 2, 1, '#5a5048'); g.r(26, y + 6, 2, 1, '#5a5048'); }
}
function hairFrontBack(g, c, P, dy) {
  const y = 4 + dy;
  if (P.hs === 'long') { g.rr(13, y + 2, 22, 25, 4, c.hr); g.r(16, y + 12, 1, 12, c.hrh); g.r(33, y + 6, 2, 20, c.hrs); g.r(13, y + 20, 22, 2, c.hrs); }
  if (P.hs === 'ponytail') { g.rr(31, y + 9, 5, 11, 2, c.hrs); g.r(31, y + 9, 5, 2, c.hr); }
  if (P.hs === 'curly') { g.ell(23, y + 2, 12, 8, c.hr); }
}
function hairFront(g, c, P, dy) {
  const y = 4 + dy, hs = P.hs;
  const cap = (h) => { g.rr(15, y - 2, 18, h, 3, c.hr); g.r(18, y - 2, 7, 1, c.hrh); g.r(15, y + h - 3, 18, 1, c.hrs); };
  if (P.hat === 'cap') {
    g.rr(15, y - 3, 18, 8, 3, c.hat); g.r(18, y - 3, 7, 1, shade(c.hat, .2)); g.r(14, y + 4, 20, 3, shade(c.hat, -.18)); g.r(14, y + 6, 20, 1, shade(c.hat, -.34));
    g.r(15, y + 7, 3, 3, c.hr); g.r(30, y + 7, 3, 3, c.hr); return;
  }
  if (P.hat === 'beanie') { g.rr(15, y - 4, 18, 11, 4, c.hat); g.r(15, y + 3, 18, 3, shade(c.hat, .14)); g.r(18, y - 4, 7, 1, shade(c.hat, .2)); for (let i = 0; i < 6; i++) g.r(16 + i * 3, y + 3, 1, 3, shade(c.hat, -.12)); g.r(15, y + 7, 3, 3, c.hr); g.r(30, y + 7, 3, 3, c.hr); return; }
  switch (hs) {
    case 'bald': g.r(19, y, 6, 1, c.skh); break;
    case 'buzz': g.rr(15, y - 1, 18, 7, 3, c.hr); g.r(15, y + 6, 3, 3, c.hr); g.r(30, y + 6, 3, 3, c.hr); g.r(18, y - 1, 6, 1, c.hrh); break;
    case 'long': cap(8); g.r(15, y + 6, 5, 5, c.hr); g.r(28, y + 6, 5, 5, c.hr); g.rr(12, y + 4, 4, 22, 1, c.hr); g.rr(32, y + 4, 4, 22, 1, c.hr); g.r(14, y + 10, 1, 14, c.hrs); g.r(34, y + 10, 1, 14, c.hrs); break;
    case 'bun': cap(8); g.r(15, y + 6, 3, 4, c.hr); g.r(30, y + 6, 3, 4, c.hr); g.rr(20, y - 7, 8, 6, 2, c.hr); g.r(21, y - 7, 4, 1, c.hrh); g.r(20, y - 3, 8, 1, c.hrs); break;
    case 'curly': g.ell(23, y + 1, 11, 7, c.hr); g.r(13, y + 4, 4, 9, c.hr); g.r(31, y + 4, 4, 9, c.hr); g.r(17, y + 5, 14, 1, c.hr); for (let i = 0; i < 9; i++) g.p(14 + ((i * 7) % 20), y - 4 + ((i * 3) % 9), c.hrh); for (let i = 0; i < 7; i++) g.p(15 + ((i * 5) % 18), y - 3 + ((i * 5) % 10), c.hrs); break;
    case 'ponytail': cap(8); g.r(15, y + 6, 3, 4, c.hr); g.r(30, y + 6, 3, 4, c.hr); break;
    default: cap(8); g.r(15, y + 6, 3, 4, c.hr); g.r(30, y + 6, 3, 4, c.hr); g.r(18, y + 6, 5, 1, c.hr); g.r(26, y + 6, 3, 1, c.hr);
  }
}

/* ---------- ESPALDA ---------- */
function torsoBack(g, c, P, dy) {
  const x = 17, y = 20 + dy, w = 14, h = 13;
  g.rr(x, y, w, h, 1, c.tp);
  g.r(x + w - 2, y + 1, 2, h - 2, c.tps); g.r(x, y + h - 1, w, 1, c.tps); g.r(x + 1, y, w - 3, 1, c.tph);
  if (P.ts === 'hoodie') { g.rr(18, y - 1, 12, 7, 3, c.tps); g.r(20, y, 8, 1, shade(c.tp, -.08)); }
  else if (P.ts === 'blazer') { g.r(23, y + 1, 2, h - 2, c.tps); g.r(17, y + 8, 14, 1, c.tps); }
  else if (P.ts === 'turtle') { g.r(20, y - 2, 8, 3, c.tp); }
  else if (P.ts === 'sweater') g.r(x, y + h - 3, w, 3, shade(c.tp, .12));
  else if (P.ts === 'shirt') { g.r(21, y, 6, 1, '#f5eee0'); g.r(23, y + 1, 2, h - 2, shade(c.tp, .1)); }
}
function legsBack(g, c, lL, lR) {
  const leg = (x, l) => { g.r(x, 32, 6, 9 + l, c.pn); g.r(x + 5, 32, 1, 9 + l, c.pns); g.r(x, 32, 6, 2, c.pns); g.r(x - 1, 40 + l, 7, 3, c.sh); g.r(x - 1, 42 + l, 7, 1, c.shs); };
  leg(18, lL); leg(24, lR);
}
function headBack(g, c, P, dy) {
  const y = 4 + dy;
  g.rr(16, y, 16, 15, 3, c.sk); g.r(14, y + 6, 2, 4, c.sk); g.r(32, y + 6, 2, 4, c.sk);
  g.r(21, y + 14, 6, 3, c.sks);
}
function hairBack(g, c, P, dy) {
  const y = 4 + dy, hs = P.hs;
  if (P.hat === 'cap') { g.rr(15, y - 3, 18, 14, 3, c.hat); g.r(18, y - 3, 7, 1, shade(c.hat, .2)); g.r(15, y + 8, 18, 1, shade(c.hat, -.18)); g.r(20, y + 8, 8, 2, shade(c.hat, -.3)); g.r(15, y + 9, 3, 3, c.hr); g.r(30, y + 9, 3, 3, c.hr); g.r(18, y + 9, 12, 2, c.hr); return; }
  if (P.hat === 'beanie') { g.rr(15, y - 4, 18, 15, 4, c.hat); g.r(15, y + 6, 18, 3, shade(c.hat, .14)); g.r(18, y - 4, 7, 1, shade(c.hat, .2)); g.r(15, y + 10, 18, 2, c.hr); return; }
  switch (hs) {
    case 'bald': g.rr(16, y, 16, 12, 3, c.sk); g.r(19, y, 6, 1, c.skh); break;
    case 'buzz': g.rr(15, y - 1, 18, 14, 3, c.hr); g.r(18, y - 1, 6, 1, c.hrh); break;
    case 'long': g.rr(13, y - 2, 22, 28, 4, c.hr); g.r(33, y + 4, 2, 20, c.hrs); g.r(13, y + 22, 22, 2, c.hrs); g.r(18, y - 2, 7, 1, c.hrh); g.r(23, y + 6, 2, 17, c.hrs); break;
    case 'bun': g.rr(15, y - 2, 18, 14, 3, c.hr); g.rr(20, y - 7, 8, 6, 2, c.hr); g.r(21, y - 7, 4, 1, c.hrh); g.r(20, y - 3, 8, 1, c.hrs); break;
    case 'curly': g.ell(23, y + 3, 12, 9, c.hr); g.r(13, y + 4, 4, 9, c.hr); g.r(31, y + 4, 4, 9, c.hr); for (let i = 0; i < 12; i++) g.p(14 + ((i * 7) % 20), y - 3 + ((i * 3) % 14), c.hrh); for (let i = 0; i < 9; i++) g.p(15 + ((i * 5) % 18), y - 2 + ((i * 5) % 13), c.hrs); break;
    case 'ponytail': g.rr(15, y - 2, 18, 14, 3, c.hr); g.rr(21, y + 9, 6, 15, 2, c.hr); g.r(21, y + 9, 6, 2, c.hrh); g.r(22, y + 12, 4, 1, '#d9bb6e'); g.r(25, y + 12, 1, 11, c.hrs); break;
    default: g.rr(15, y - 2, 18, 15, 3, c.hr); g.r(18, y - 2, 7, 1, c.hrh); g.r(15, y + 10, 18, 1, c.hrs);
  }
  if (P.acc === 'phones') { g.r(14, y + 3, 3, 7, c.bd); g.r(31, y + 3, 3, 7, c.bd); g.r(15, y - 3, 18, 2, shade(c.bd, -.35)); g.r(14, y + 3, 1, 7, shade(c.bd, -.3)); }
}

/* ---------- PERFIL (mira a la derecha) ---------- */
function drawSideBody(g, c, P, o) {
  const dy = o.dy, s = o.stride;
  // brazo lejano
  g.rr(23 - o.arm, 22 + dy, 4, 10, 1, c.tps); g.r(23 - o.arm, 30 + dy, 4, 3, c.sks);
  // piernas
  const leg = (x, col, cols, l) => { g.r(x, 32, 5, 9 + l, col); g.r(x, 32, 5, 2, cols); g.r(x - 1, 40 + l, 8, 3, c.sh); g.r(x - 1, 42 + l, 8, 1, c.shs); g.r(x + 5, 40 + l, 2, 1, shade(c.sh, .25)); };
  leg(21 - s, c.pns, shade(c.pns, -.2), o.lLift || 0);
  leg(21 + s, c.pn, c.pns, o.rLift || 0);
  // torso
  g.rr(20, 20 + dy, 10, 13, 1, c.tp); g.r(28, 21 + dy, 2, 11, c.tps); g.r(20, 32 + dy, 10, 1, c.tps); g.r(21, 20 + dy, 7, 1, c.tph);
  if (P.ts === 'hoodie') { g.rr(18, 19 + dy, 8, 6, 3, c.tps); g.r(21, 29 + dy, 8, 1, c.tps); }
  if (P.ts === 'blazer') { g.r(28, 21 + dy, 1, 6, '#f5eee0'); g.r(23, 28 + dy, 1, 4, c.tps); }
  if (P.ts === 'turtle') g.r(22, 18 + dy, 6, 3, c.tp);
  if (P.ts === 'sweater') g.r(20, 30 + dy, 10, 3, shade(c.tp, .12));
  if (P.ts === 'shirt') { g.r(27, 20 + dy, 3, 2, '#f5eee0'); g.p(29, 24 + dy, c.tps); g.p(29, 27 + dy, c.tps); }
  g.r(28, 24 + dy, 2, 3, c.bd);
  // brazo cercano
  const long = P.ts !== 'tee', sl = long ? 8 : 4;
  g.rr(22 + o.arm, 22 + dy, 4, sl, 1, c.tp); g.r(25 + o.arm, 22 + dy, 1, sl, c.tps);
  g.r(22 + o.arm, 22 + dy + sl, 4, 10 - sl, c.sk); g.r(22 + o.arm, 30 + dy, 4, 3, c.sk);
  if (long) g.r(22 + o.arm, 21 + dy + sl, 4, 1, shade(c.tp, -.3));
}
function drawSideHead(g, c, P, dy) {
  const y = 4 + dy;
  if (P.hs === 'long') g.rr(14, y + 1, 12, 24, 4, c.hr);
  if (P.hs === 'ponytail') { g.rr(13, y + 6, 5, 13, 2, c.hrs); g.r(13, y + 6, 5, 2, c.hr); }
  if (P.hs === 'curly') g.ell(21, y + 2, 10, 8, c.hr);
  g.rr(17, y, 15, 15, 3, c.sk); g.r(17, y + 14, 15, 1, c.sks);
  g.r(32, y + 7, 1, 2, c.sk);                                    // nariz
  g.r(22, y + 6, 3, 3, c.sks); g.p(23, y + 7, shade(c.sk, -.3));  // oreja
  g.r(27, y + 6, 2, 3, EYE); g.p(27, y + 6, '#ffffff');
  g.r(29, y + 12, 2, 1, '#8c4a3b'); g.r(29, y + 10, 2, 1, 'rgba(214,110,100,.55)');
  if (P.face === 'beard') { g.rr(23, y + 9, 9, 6, 2, c.hrs); g.r(29, y + 12, 2, 1, '#6d352b'); }
  if (P.face === 'stache') g.r(28, y + 10, 4, 1, c.hrs);
  if (P.face === 'stubble') for (let i = 0; i < 6; i++) g.p(25 + i, y + 11 + (i % 3), shade(c.sk, -.28));
  if (P.acc === 'glasses') { const f = '#2a1b14'; g.r(25, y + 5, 6, 1, f); g.r(25, y + 9, 6, 1, f); g.r(25, y + 5, 1, 5, f); g.r(30, y + 5, 1, 5, f); g.r(22, y + 6, 3, 1, f); g.r(26, y + 6, 4, 3, 'rgba(190,225,240,.32)'); }
  if (P.acc === 'shades') { g.r(25, y + 5, 6, 4, '#16100c'); g.r(22, y + 6, 3, 1, '#16100c'); g.r(26, y + 6, 2, 1, '#5a5048'); }
  const hs = P.hs;
  if (P.hat === 'cap') { g.rr(16, y - 3, 16, 8, 3, c.hat); g.r(19, y - 3, 6, 1, shade(c.hat, .2)); g.r(28, y + 4, 8, 3, shade(c.hat, -.18)); g.r(28, y + 6, 8, 1, shade(c.hat, -.34)); g.r(16, y + 5, 7, 6, c.hr); return; }
  if (P.hat === 'beanie') { g.rr(15, y - 4, 17, 11, 4, c.hat); g.r(15, y + 3, 17, 3, shade(c.hat, .14)); g.r(18, y - 4, 7, 1, shade(c.hat, .2)); g.r(16, y + 6, 7, 5, c.hr); return; }
  switch (hs) {
    case 'bald': g.r(20, y, 6, 1, c.skh); break;
    case 'buzz': g.rr(16, y - 1, 16, 7, 3, c.hr); g.r(16, y + 5, 6, 5, c.hr); break;
    case 'long': g.rr(15, y - 2, 17, 9, 3, c.hr); g.r(15, y + 6, 8, 15, c.hr); g.r(26, y + 6, 4, 1, c.hr); g.r(15, y + 20, 8, 1, c.hrs); break;
    case 'bun': g.rr(16, y - 2, 16, 9, 3, c.hr); g.r(16, y + 6, 7, 6, c.hr); g.rr(15, y - 6, 7, 6, 2, c.hr); g.r(26, y + 6, 3, 1, c.hr); break;
    case 'curly': g.ell(22, y + 1, 10, 7, c.hr); g.r(15, y + 4, 8, 9, c.hr); for (let i = 0; i < 8; i++) g.p(14 + ((i * 7) % 16), y - 4 + ((i * 3) % 9), c.hrh); break;
    case 'ponytail': g.rr(16, y - 2, 16, 9, 3, c.hr); g.r(16, y + 6, 7, 6, c.hr); g.r(26, y + 6, 3, 1, c.hr); break;
    default: g.rr(16, y - 2, 16, 9, 3, c.hr); g.r(16, y + 6, 7, 6, c.hr); g.r(26, y + 6, 4, 1, c.hr); g.r(19, y - 2, 6, 1, c.hrh);
  }
  if (P.acc === 'phones') { g.r(21, y + 4, 5, 7, c.bd); g.r(20, y - 3, 11, 2, shade(c.bd, -.35)); }
}

/* ---------- composición de una pose ---------- */
function drawPose(ctx, view, pose, fr, P) {
  const g = new Pen(ctx, 0, OY), c = cpal(P);
  const walk = pose === 'walk', sit = pose === 'sit';
  const bob = walk ? [0, -1, 0, -1][fr & 3] : (pose === 'stand' ? [0, -1][fr & 1] : 0);
  const lL = walk ? [0, -2, 0, 0][fr & 3] : 0, lR = walk ? [0, 0, 0, -2][fr & 3] : 0;
  const swing = walk ? [0, 2, 0, -2][fr & 3] : 0;
  if (view === 'S') {
    if (!sit) {
      hairFrontBack(g, c, P, bob); legsFront(g, c, lL, lR); torsoFront(g, c, P, bob);
      armsFront(g, c, P, bob, swing, -swing); headFront(g, c, P, bob); hairFront(g, c, P, bob);
    } else {  // sentado de frente (detrás de una mesa)
      const t = fr & 3, ty = t === 1 ? -1 : t === 2 ? 0 : 0, dyS = 1;
      hairFrontBack(g, c, P, dyS);
      g.r(18, 32, 12, 6, c.pn); g.r(17, 37, 14, 3, c.pns);
      torsoFront(g, c, P, dyS);
      // brazos hacia delante (manos sobre la mesa)
      const arm = (x, right, up) => { const long = P.ts !== 'tee'; g.rr(x, 22 + dyS, 4, 7, 1, c.tp); g.r(right ? x + 3 : x, 22 + dyS, 1, 7, c.tps); g.r(right ? x - 3 : x + 3, 28 + dyS + up, 6, 3, long ? c.tp : c.sk); g.r(right ? x - 5 : x + 5, 28 + dyS + up, 3, 3, c.sk); };
      arm(13, false, t === 1 ? -1 : 0); arm(31, true, t === 2 ? -1 : 0);
      headFront(g, c, P, dyS); hairFront(g, c, P, dyS);
    }
  } else if (view === 'N') {
    if (!sit) {
      legsBack(g, c, lL, lR); torsoBack(g, c, P, bob);
      // brazos
      const long = P.ts !== 'tee';
      const arm = (x, ady, right) => { const y = 21 + bob + ady, sl = long ? 8 : 4; g.rr(x, y, 4, sl, 1, c.tp); g.r(right ? x + 3 : x, y, 1, sl, c.tps); g.r(x, y + sl, 4, 12 - sl, c.sk); g.r(x, y + 10, 4, 2, c.sk); if (long) g.r(x, y + sl - 1, 4, 1, shade(c.tp, -.3)); };
      arm(13, swing, false); arm(31, -swing, true);
      headBack(g, c, P, bob); hairBack(g, c, P, bob);
    } else {  // sentado de espaldas (teclado delante)
      const t = fr % 3, up = [0, -1, 0][t], up2 = [0, 0, -1][t], dyS = 2;
      g.r(18, 32, 12, 7, c.pn); g.r(17, 37, 14, 3, c.pns);
      torsoBack(g, c, P, dyS);
      const long = P.ts !== 'tee';
      // codos hacia fuera; las manos quedan ocultas tras el cuerpo, en el teclado
      const arm = (x, right, u) => { const ax = right ? x + 1 : x - 1; g.rr(ax, 22 + dyS + u, 4, 8, 1, c.tp); g.r(right ? ax + 3 : ax, 22 + dyS + u, 1, 8, c.tps); g.r(ax, 29 + dyS + u, 4, 1, shade(c.tp, -.3)); if (!long) g.r(ax, 26 + dyS + u, 4, 4, c.sk); };
      arm(13, false, up); arm(31, true, up2);
      headBack(g, c, P, dyS); hairBack(g, c, P, dyS);
    }
  } else { // 'E'
    if (!sit) {
      drawSideBody(g, c, P, { dy: bob, stride: walk ? [0, 3, 0, -3][fr & 3] : 0, arm: walk ? [0, -2, 0, 2][fr & 3] : 0, lLift: walk ? [0, -1, 0, 0][fr & 3] : 0, rLift: walk ? [0, 0, 0, -1][fr & 3] : 0 });
      drawSideHead(g, c, P, bob);
    } else {  // sentado de perfil (sofás, sillones)
      const dyS = 3;
      g.r(14, 33, 14, 5, c.pn); g.r(14, 33, 14, 1, c.pns); g.r(24, 36, 6, 9, c.pn); g.r(24, 43, 7, 3, c.sh);  // muslos y espinillas
      g.rr(20, 20 + dyS, 10, 12, 1, c.tp); g.r(28, 21 + dyS, 2, 10, c.tps); g.r(28, 24 + dyS, 2, 3, c.bd);
      if (P.ts === 'hoodie') g.rr(18, 19 + dyS, 8, 6, 3, c.tps);
      g.rr(22, 23 + dyS, 4, 7, 1, c.tp); g.r(26, 28 + dyS, 5, 3, c.sk);
      drawSideHead(g, c, P, dyS);
    }
  }
}

/* ---------- hoja de sprites de un personaje ---------- */
const _sheetCache = new Map();
function sheetKey(P) { return [P.skin, P.hair, P.hs, P.top, P.ts, P.pants, P.shoes, P.acc || '', P.face || '', P.hat || '', P.hatC || '', P.badge || ''].join('|'); }
function buildSheet(P) {
  const k = sheetKey(P); if (_sheetCache.has(k)) return _sheetCache.get(k);
  const [sc, sx] = cvs(FR * 4, FR * POSES.length);
  const [tc, tx] = cvs(FR, FR);
  POSES.forEach((key, row) => {
    const [pose, view] = key.split('-');
    const n = pose === 'walk' ? 4 : 3;
    for (let f = 0; f < n; f++) {
      tx.clearRect(0, 0, FR, FR);
      drawPose(tx, view, pose, f, P);
      Pen.outline(tx, FR, FR, OUT);
      sx.drawImage(tc, f * FR, row * FR);
    }
  });
  const sheet = { canvas: sc, row: (key) => POSES.indexOf(key) };
  _sheetCache.set(k, sheet);
  return sheet;
}
/* retrato cuadrado de la cabeza para listas y chats */
function avatarCanvas(P, px) {
  const rendered = typeof window !== 'undefined' && window.LC_STUDIO && window.LC_STUDIO.portrait(P, px);
  if (rendered) { const [c, x] = cvs(px || 40, px || 40); x.imageSmoothingEnabled = true; x.drawImage(rendered, 0, 0, c.width, c.height); return c; }
  const sh = buildSheet(P); const s = px || 40;
  const [c, x] = cvs(s, s); x.imageSmoothingEnabled = false;
  x.fillStyle = P.bg || '#4a5d4f'; x.fillRect(0, 0, s, s);
  x.drawImage(sh.canvas, 10, 2 + 0 * FR, 28, 26, 0, 0, s, s * 26 / 28);
  return c;
}
