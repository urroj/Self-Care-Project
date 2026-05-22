// theme.js — pixel desktop design system
// Palette: Pixel Game Pink — inspired by chic pixel heart UI
// Light pink · medium rose · deep rose · dark maroon · cream white

export const C = {
  desk:  '#FFD6E5',   // light pink          — desktop surface
  win:   '#FFF0F5',   // lavender blush       — window body
  bar:   '#C4506A',   // deep rose            — title bar
  barT:  '#FFFFFF',   // white                — title bar text
  frame: '#7A1A38',   // dark maroon          — window frame / border
  face:  '#F090A8',   // medium pink          — button / menubar face
  hi:    '#FFD0E0',   // light pink           — bevel highlight edge
  sh:    '#5A0020',   // very dark maroon     — bevel shadow edge
  txt:   '#3A0018',   // near-black maroon    — primary text
  mut:   '#9A4060',   // muted rose           — secondary / label text
  accent:'#C4506A',   // deep rose            — accent (was misnamed C.sage)
  inp:   '#FFF5F8',   // very light pink      — input background
  ok:    '#5A8E72',   // sage green           — success (kept green for clarity)
  err:   '#7A1A38',   // dark maroon          — error states
  grd:   '#E8A0B8',   // medium pink          — grid lines / borders
  r1:    '#FFF5F8',   // very light pink      — table row odd
  r2:    '#FFE8F0',   // soft pink            — table row even
}

export const FONT   = '"Press Start 2P", "Courier New", monospace'
export const RAISED = `inset -1px -2px 0 rgba(90,0,32,0.28), inset 1px 1px 0 rgba(255,208,224,0.75)`
export const SUNKEN = `inset 1px 2px 0 rgba(90,0,32,0.22), inset -1px -1px 0 rgba(255,208,224,0.55)`

// Font size scale for Press Start 2P
// This font renders visually larger than Courier New — sizes are tuned down
export const SIZE = {
  xs:   9,    // labels, tags, badges, status bar
  sm:   10,   // menu items, tabs, secondary labels, table text
  md:   11,   // body text, inputs, buttons, notifications
  lg:   13,   // run-card values, active cycle info values
  xl:   18,   // stat card numbers
}

// Shared table cell style
export const TD = {
  padding:     '4px 8px',
  borderRight: `1px solid ${C.grd}`,
  whiteSpace:  'nowrap',
  fontSize:    SIZE.sm,
  fontFamily:  FONT,
  color:       C.txt,
  lineHeight:  1.8,
}

// Shared table header style
export const TH = {
  ...TD,
  background:  C.bar,
  color:       C.barT,
  fontWeight:  'normal',
  borderRight: `1px solid rgba(255,255,255,0.2)`,
  padding:     '5px 8px',
}