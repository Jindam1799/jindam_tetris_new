'use strict';
/* =========================================================
   진담중국어 테트리스 — script.js
   ---------------------------------------------------------
   1. 설정 저장/불러오기
   2. 사운드 (Web Audio 합성 효과음 + BGM mp3)
   3. 중국어 음성 (Tingting 우선)
   4. 블록 / 색상 / 회전(SRS)
   5. 게임 진행 (생성·이동·고정·줄 삭제·점수·레벨)
   6. 아이템 · 방해 이벤트
   7. 퀴즈
   8. 그리기 (보드·고스트·파티클·미리보기)
   9. 메인 루프 / 키 입력
  10. 화면 전환 (인트로·로비·일시정지·클리어·게임오버·랭킹·설정)
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* ---------------- 1. 설정 ---------------- */
function loadJSON(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch (e) {
    return def;
  }
}
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}
const SETTINGS_KEY = 'cntetris_settings_v2';
const settings = Object.assign(
  { bgm: 45, sfx: 75, tts: true, rate: 85, voice: '', ghost: true, muted: false },
  loadJSON(SETTINGS_KEY, {}),
);
const saveSettings = () => saveJSON(SETTINGS_KEY, settings);

/* ---------------- 2. 사운드 ---------------- */
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setVolume();
  }
  function setVolume() {
    if (master) master.gain.value = settings.muted ? 0 : (settings.sfx / 100) * 0.9;
  }
  function tone(f, dur, o = {}) {
    if (!ctx) return;
    const { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.004 } = o;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  function noise(dur, o = {}) {
    if (!ctx) return;
    const { vol = 0.2, freq = 2000, to = null, type = 'lowpass', delay = 0, q = 0.7 } = o;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(freq, t);
    if (to) filt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }
  // 종소리 (배음 3개)
  function bell(f, dur, vol, delay = 0) {
    tone(f, dur, { vol, delay });
    tone(f * 2, dur * 0.6, { vol: vol * 0.35, delay });
    tone(f * 3.01, dur * 0.3, { type: 'triangle', vol: vol * 0.1, delay });
  }
  // 중국풍 5음계 (궁상각치우: C D E G A)
  const PENTA = [0, 2, 4, 7, 9];
  function pn(i) {
    const oct = Math.floor(i / 5);
    const deg = ((i % 5) + 5) % 5;
    return 523.25 * Math.pow(2, oct + PENTA[deg] / 12);
  }
  function gong(delay = 0, vol = 0.4) {
    tone(98, 2.2, { vol, delay, attack: 0.01 });
    tone(101, 2.0, { vol: vol * 0.6, delay, attack: 0.01 });
    tone(98 * 2.76, 1.2, { vol: vol * 0.18, delay });
    noise(0.35, { vol: vol * 0.3, freq: 900, to: 200, delay });
  }

  const sfx = {
    move: () => tone(880, 0.025, { type: 'square', vol: 0.03 }),
    rotate: () => tone(600, 0.06, { type: 'triangle', vol: 0.12, to: 950 }),
    soft: () => tone(240, 0.02, { vol: 0.035 }),
    hard: () => {
      tone(170, 0.18, { vol: 0.55, to: 45 });
      noise(0.09, { vol: 0.22, freq: 1600, to: 200 });
    },
    lock: () => {
      tone(240, 0.06, { type: 'triangle', vol: 0.13, to: 150 });
      noise(0.03, { vol: 0.07, freq: 3000 });
    },
    hold: () => {
      tone(500, 0.07, { vol: 0.14, to: 900 });
      tone(900, 0.08, { vol: 0.1, to: 600, delay: 0.06 });
    },
    clear: (lines, combo) => {
      const b = Math.min(Math.max(combo, 0), 9);
      for (let i = 0; i <= lines; i++) bell(pn(b + i), 0.35, 0.15, i * 0.055);
      noise(0.25, { vol: 0.06, freq: 5000, type: 'highpass' });
    },
    tetris: (combo) => {
      const b = Math.min(Math.max(combo, 0), 5);
      for (let i = 0; i < 8; i++) bell(pn(b + i), 0.4, 0.13, i * 0.045);
      bell(pn(b + 5), 1.1, 0.12, 0.4);
      bell(pn(b + 7), 1.1, 0.1, 0.4);
      gong(0.36, 0.35);
      noise(0.6, { vol: 0.08, freq: 6000, type: 'highpass', delay: 0.36 });
    },
    allClear: () => {
      for (let i = 0; i < 12; i++) bell(pn(i), 0.3, 0.12, i * 0.04);
      gong(0.5, 0.4);
    },
    quiz: () => {
      bell(784, 0.3, 0.14);
      bell(1046.5, 0.45, 0.14, 0.1);
    },
    correct: () => {
      bell(1318.5, 0.25, 0.16);
      bell(1568, 0.5, 0.18, 0.09);
    },
    wrong: () => {
      tone(185, 0.34, { type: 'sawtooth', vol: 0.11, to: 90 });
      tone(176, 0.34, { type: 'square', vol: 0.05, to: 85 });
    },
    tick: () => tone(1250, 0.03, { type: 'square', vol: 0.05 }),
    item: () => {
      tone(300, 0.35, { type: 'square', vol: 0.06, to: 1600 });
      for (let i = 0; i < 5; i++) bell(pn(5 + i * 2), 0.22, 0.1, 0.25 + i * 0.05);
    },
    bomb: () => {
      noise(0.9, { vol: 0.7, freq: 4000, to: 80 });
      tone(100, 0.6, { vol: 0.6, to: 28 });
    },
    gravity: () => {
      tone(900, 0.5, { type: 'triangle', vol: 0.14, to: 80 });
      noise(0.45, { vol: 0.22, freq: 900, to: 150, delay: 0.3 });
    },
    zap: () => {
      noise(0.4, { vol: 0.45, freq: 6000, to: 500, type: 'bandpass', q: 2 });
      tone(1800, 0.3, { type: 'sawtooth', vol: 0.07, to: 200 });
    },
    penalty: () => {
      tone(90, 0.4, { type: 'sawtooth', vol: 0.17, to: 55 });
      noise(0.35, { vol: 0.2, freq: 700, to: 120 });
    },
    warn: () => {
      [0, 0.15, 0.3].forEach((d, i) => tone(i % 2 ? 660 : 880, 0.12, { type: 'square', vol: 0.07, delay: d }));
    },
    quake: () => {
      noise(1.0, { vol: 0.45, freq: 300, to: 60 });
      tone(55, 0.9, { type: 'sawtooth', vol: 0.14, to: 35 });
    },
    sand: () => noise(0.05, { vol: 0.06, freq: 1200 }),
    levelUp: () => {
      [0, 1, 2, 3, 4, 5, 7].forEach((n, i) => bell(pn(n), 0.35, 0.14, i * 0.08));
      gong(0.55, 0.35);
    },
    over: () => {
      [7, 5, 3, 1, 0].forEach((n, i) => tone(pn(n) / 2, 0.38, { type: 'triangle', vol: 0.14, delay: i * 0.17 }));
      gong(0.9, 0.3);
    },
    count: (go) => (go ? (bell(1046.5, 0.6, 0.2), bell(1568, 0.6, 0.12, 0.05)) : tone(523, 0.12, { type: 'square', vol: 0.07 })),
    fever: () => {
      tone(200, 0.6, { type: 'sawtooth', vol: 0.07, to: 1200 });
      [0, 2, 4, 7, 9, 10].forEach((n, i) => bell(pn(n + 3), 0.3, 0.12, 0.3 + i * 0.05));
    },
    ui: () => tone(700, 0.04, { vol: 0.08 }),
  };
  return { init, setVolume, sfx };
})();
const S = Sound.sfx;

const BGM = (() => {
  const TRACKS = {
    lobby: ['lobby'],
    PRACTICE: ['practice', 'practice2'],
    NORMAL: ['normal', 'normal2'],
    HELL: ['hell', 'hell2'],
    over: ['over'],
  };
  let cur = null;
  let curKey = '';
  let duck = 1;
  const vol = () => (settings.muted ? 0 : (settings.bgm / 100) * 0.6 * duck);

  function fade(a, target, ms, done) {
    const id = (a._fade = (a._fade || 0) + 1);
    const start = a.volume;
    const t0 = performance.now();
    const step = () => {
      if (a._fade !== id) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k < 1) setTimeout(step, 30);
      else if (done) done();
    };
    step();
  }
  function play(key) {
    if (cur && curKey === key && key === 'lobby' && !cur.paused) return;
    stop();
    const list = TRACKS[key];
    const a = new Audio('sound/' + list[Math.floor(Math.random() * list.length)] + '.mp3');
    a.loop = true;
    a.volume = 0;
    cur = a;
    curKey = key;
    a.play().catch(() => {});
    fade(a, vol(), 700);
  }
  function stop() {
    if (!cur) return;
    const a = cur;
    cur = null;
    curKey = '';
    fade(a, 0, 350, () => a.pause());
  }
  return {
    play,
    stop,
    setDuck(d) {
      duck = d;
      if (cur) fade(cur, vol(), 250);
    },
    refresh() {
      if (cur) cur.volume = vol();
    },
    pause() {
      if (cur) cur.pause();
    },
    resume() {
      if (cur) cur.play().catch(() => {});
    },
  };
})();

/* ---------------- 3. 중국어 음성 (Tingting 우선) ---------------- */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let voice = null;
  let voices = [];
  const PREFS = [/ting[\s-]?ting|婷婷/i, /google.*(普通话|mandarin)/i, /xiaoxiao|晓晓/i, /huihui|慧慧/i, /yaoyao|瑶瑶/i, /kangkang|康康/i];
  const notMainland = (v) => /HK|TW|yue|粤|香港|台|臺|cantonese/i.test(v.lang + ' ' + v.name);

  function choose() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^(zh|cmn)/i.test(v.lang) || /chinese|中文|普通话|tingting|婷婷/i.test(v.name));
    voice = null;
    if (!voices.length) return;
    if (settings.voice) voice = voices.find((v) => v.name === settings.voice) || null;
    if (!voice) {
      for (const re of PREFS) {
        voice = voices.find((v) => re.test(v.name) && !notMainland(v));
        if (voice) break;
      }
    }
    if (!voice) voice = voices.find((v) => /zh[-_]CN/i.test(v.lang)) || voices.find((v) => !notMainland(v)) || voices[0];
  }
  if (synth) {
    choose();
    synth.addEventListener ? synth.addEventListener('voiceschanged', onVoices) : (synth.onvoiceschanged = onVoices);
  }
  function onVoices() {
    choose();
    if (typeof fillVoiceSelect === 'function') fillVoiceSelect();
  }
  function speak(text, rate) {
    if (!synth || !settings.tts || settings.muted || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = rate || settings.rate / 100;
    u.pitch = 1.05;
    synth.speak(u);
  }
  return {
    speak,
    choose,
    get voice() {
      return voice;
    },
    get voices() {
      return voices;
    },
    get available() {
      return !!synth && voices.length > 0;
    },
  };
})();

/* ---------------- 4. 블록 · 색상 · 회전 ---------------- */
const COLS = 10;
const ROWS = 20;
const BS = 40;
const LINES_PER_LEVEL = 20; // 레벨당 지울 줄 (예전 30 → 템포 개선)

// 1~7 기본, 8 낙석(모래), 9 방해벽돌, 10 폭탄, 11 중력, 12~16 헬 특수블록, 17 번개
const COLORS = [
  null, '#2fe6ff', '#3d7bff', '#ff9a2e', '#ffd93b', '#34e07a', '#b65cff', '#ff4560',
  '#a88d68', '#5b5672', '#ff4560', '#b65cff', '#1de9b6', '#ff7ad9', '#9d8cff', '#ffe08a', '#ff9f80', '#ffd93b',
];
const ITEM_ICON = { 10: '💣', 11: '⏬', 17: '⚡' };
const ITEM_NAME = { 10: '💣 火烧连营!', 11: '⏬ 泰山压顶!', 17: '⚡ 一扫而光!' };
const isItem = (v) => v === 10 || v === 11 || v === 17;

const SHAPES = {
  1: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  2: [[2, 0, 0], [2, 2, 2], [0, 0, 0]],
  3: [[0, 0, 3], [3, 3, 3], [0, 0, 0]],
  4: [[4, 4], [4, 4]],
  5: [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
  6: [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
  7: [[7, 7, 0], [0, 7, 7], [0, 0, 0]],
  10: [[10]],
  11: [[11]],
  12: [[12, 0, 12], [12, 12, 12], [0, 0, 0]],
  13: [[0, 13, 0], [13, 13, 13], [0, 13, 0]],
  14: [[14, 0, 0], [14, 0, 0], [14, 14, 14]],
  15: [[15, 15], [15, 0]],
  16: [[16, 0, 0], [16, 16, 0], [0, 16, 16]],
  17: [[17]],
};
const SPECIALS = [12, 13, 14, 15, 16];

// SRS 벽차기 테이블 (x, y-위쪽)
const KICK_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICK_SIMPLE = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1]];

const rotCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const rotCCW = (m) => m[0].map((_, i) => m.map((r) => r[r.length - 1 - i]));

// 블록 스프라이트 (미리 그려서 캐시)
const spriteCache = {};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function sprite(v, size) {
  const key = v + '_' + size;
  if (spriteCache[key]) return spriteCache[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const col = COLORS[v];
  const pad = Math.max(1, size * 0.04);
  const r = size * 0.18;
  const grad = c.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, shade(col, 0.38));
  grad.addColorStop(0.5, col);
  grad.addColorStop(1, shade(col, -0.38));
  rrect(c, pad, pad, size - pad * 2, size - pad * 2, r);
  c.fillStyle = grad;
  c.fill();
  c.lineWidth = Math.max(1, size * 0.05);
  c.strokeStyle = shade(col, -0.5);
  c.stroke();
  rrect(c, size * 0.17, size * 0.14, size * 0.66, size * 0.24, r * 0.6);
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.fill();
  if (v === 9) {
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = Math.max(1, size * 0.04);
    c.beginPath();
    c.moveTo(pad * 2, size / 2);
    c.lineTo(size - pad * 2, size / 2);
    c.moveTo(size / 2, size / 2);
    c.lineTo(size / 2, size - pad * 2);
    c.moveTo(size * 0.3, pad * 2);
    c.lineTo(size * 0.3, size / 2);
    c.stroke();
  }
  if (v === 8) {
    c.fillStyle = 'rgba(60,40,20,0.45)';
    for (let i = 0; i < 7; i++) c.fillRect(size * (0.2 + ((i * 37) % 60) / 100), size * (0.45 + ((i * 23) % 40) / 100), size * 0.07, size * 0.07);
  }
  if (ITEM_ICON[v]) {
    c.font = `${Math.round(size * 0.6)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ITEM_ICON[v], size / 2, size / 2 + size * 0.05);
  }
  spriteCache[key] = cv;
  return cv;
}

/* ---------------- 5. 게임 상태 ---------------- */
const MODE_CFG = {
  PRACTICE: { speed: (l) => Math.max(350, 900 * Math.pow(0.92, l - 1)), lock: 700, quizEvery: 4, quizTime: 10000, sky: 0, label: '练习 PRACTICE' },
  NORMAL: { speed: (l) => Math.max(90, 700 * Math.pow(0.85, l - 1)), lock: 500, quizEvery: 5, quizTime: 7000, sky: 22000, label: '普通 NORMAL' },
  HELL: { speed: (l) => Math.max(55, 380 * Math.pow(0.86, l - 1)), lock: 420, quizEvery: 5, quizTime: 5500, sky: 9000, label: '地狱 HELL' },
};
const CLEAR_MS = 320;
const SOFT_MS = 32;
const DAS = 150;
const ARR = 38;
const FEVER_MS = 15000;

const G = { state: 'IDLE', mode: 'NORMAL', runId: 0, particles: [], popups: [], trails: [], sky: [] };

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cfg = () => MODE_CFG[G.mode];
const isFever = () => G.feverUntil > G.clock;

function resetGame(mode) {
  Object.assign(G, {
    mode,
    runId: G.runId + 1,
    board: createBoard(),
    piece: null,
    queue: [],
    bag: [],
    hold: null,
    holdUsed: false,
    score: 0,
    level: 1,
    lines: 0,
    levelLines: 0,
    combo: -1,
    maxCombo: 0,
    b2b: false,
    dropAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    softDrop: false,
    placed: 0,
    quizPending: false,
    levelUpPending: false,
    gauge: 0,
    streak: 0,
    feverUntil: 0,
    clock: 0,
    quizRight: 0,
    quizTotal: 0,
    lvQuizRight: 0,
    lvQuizTotal: 0,
    missed: new Map(),
    quizPool: [],
    reversedUntil: 0,
    skyTimer: 0,
    sandTimer: 0,
    eventTimer: 0,
    sky: [],
    clearing: null,
    levelStart: 0,
    levelScoreStart: 0,
    overT: 0,
    particles: [],
    popups: [],
    trails: [],
  });
  G.dropInterval = cfg().speed(1);
  fillQueue();
}

function newPiece(type) {
  return { type, matrix: SHAPES[type].map((r) => [...r]), rot: 0, x: 0, y: 0 };
}
function nextFromBag() {
  if (G.mode === 'HELL' && Math.random() < 0.1) return newPiece(SPECIALS[Math.floor(Math.random() * SPECIALS.length)]);
  if (!G.bag.length) G.bag = shuffle([1, 2, 3, 4, 5, 6, 7]);
  return newPiece(G.bag.pop());
}
function fillQueue() {
  while (G.queue.length < 4) G.queue.push(nextFromBag());
}

function collideM(m, ox, oy) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const x = ox + c, y = oy + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && G.board[y][x]) return true;
    }
  }
  return false;
}
const collide = (p, dx = 0, dy = 0) => collideM(p.matrix, p.x + dx, p.y + dy);
function pieceAt(x, y) {
  const p = G.piece;
  if (!p) return false;
  const r = y - p.y, c = x - p.x;
  return r >= 0 && r < p.matrix.length && c >= 0 && c < p.matrix[r].length && !!p.matrix[r][c];
}
function eachCell(p, fn) {
  p.matrix.forEach((row, r) => row.forEach((v, c) => v && fn(p.x + c, p.y + r, v)));
}

function placeAtTop(p) {
  p.x = Math.floor((COLS - p.matrix[0].length) / 2);
  let top = 0;
  while (top < p.matrix.length && p.matrix[top].every((v) => !v)) top++;
  p.y = -top;
  for (let i = 0; i < 2 && collide(p); i++) p.y--;
  return !collide(p);
}

function spawnNext() {
  if (G.state === 'GAME_OVER') return;
  G.piece = G.queue.shift();
  fillQueue();
  G.holdUsed = false;
  G.lockAcc = 0;
  G.lockResets = 0;
  G.dropAcc = 0;
  G.state = 'PLAYING';
  if (!placeAtTop(G.piece)) return gameOver();
  drawPreviews();
}

function onMoved() {
  if (collide(G.piece, 0, 1) && G.lockResets < 15) {
    G.lockAcc = 0;
    G.lockResets++;
  }
}
function tryMove(dir) {
  const p = G.piece;
  if (!p) return false;
  const d = G.reversedUntil > G.clock ? -dir : dir;
  if (collide(p, d, 0)) return false;
  p.x += d;
  S.move();
  onMoved();
  return true;
}
function rotate(dir) {
  const p = G.piece;
  if (!p || p.type === 4 || p.matrix.length === 1) return;
  const from = p.rot;
  const to = (from + (dir > 0 ? 1 : 3)) % 4;
  const m = dir > 0 ? rotCW(p.matrix) : rotCCW(p.matrix);
  const kicks = p.type === 1 ? KICK_I[from + '>' + to] : p.type <= 7 ? KICK_JLSTZ[from + '>' + to] : KICK_SIMPLE;
  for (const [kx, ky] of kicks) {
    if (!collideM(m, p.x + kx, p.y - ky)) {
      p.matrix = m;
      p.x += kx;
      p.y -= ky;
      p.rot = to;
      S.rotate();
      onMoved();
      return;
    }
  }
}
function ghostY(p) {
  let y = p.y;
  while (!collideM(p.matrix, p.x, y + 1)) y++;
  return y;
}
function hardDrop() {
  const p = G.piece;
  if (!p) return;
  const gy = ghostY(p);
  const dist = gy - p.y;
  // 낙하 잔상
  const cols = {};
  eachCell(p, (x, y, v) => {
    if (cols[x] === undefined || y < cols[x].y) cols[x] = { y, v };
  });
  Object.keys(cols).forEach((x) => G.trails.push({ x: +x, y0: cols[x].y, y1: cols[x].y + dist, color: COLORS[cols[x].v], life: 220, max: 220 }));
  p.y = gy;
  addScore(dist * 2, true);
  S.hard();
  boardFx('thump');
  lockPiece();
}
function holdPiece() {
  if (!G.piece || G.holdUsed) return;
  const cur = newPiece(G.piece.type);
  if (G.hold) {
    G.piece = newPiece(G.hold.type);
    G.hold = cur;
    G.lockAcc = 0;
    G.lockResets = 0;
    G.dropAcc = 0;
    if (!placeAtTop(G.piece)) return gameOver();
  } else {
    G.hold = cur;
    spawnNext();
  }
  G.holdUsed = true;
  S.hold();
  drawPreviews();
}

function lockPiece() {
  const p = G.piece;
  let above = false;
  eachCell(p, (x, y, v) => {
    if (y < 0) above = true;
    else G.board[y][x] = v;
  });
  G.piece = null;
  if (above) return gameOver();
  const item = applyItems(p);
  if (!item) {
    S.lock();
    G.placed++;
    if (G.placed % cfg().quizEvery === 0) G.quizPending = true;
  }
  resolveLines(true);
}

function fullRows() {
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (G.board[y].every((v) => v)) rows.push(y);
  return rows;
}
function removeRows(rows) {
  rows.sort((a, b) => a - b).forEach((y) => {
    G.board.splice(y, 1);
    G.board.unshift(new Array(COLS).fill(0));
  });
}
function resolveLines(fromLock) {
  const rows = fullRows();
  if (!rows.length) {
    if (fromLock) {
      G.combo = -1;
      finishTurn();
    }
    return;
  }
  rows.forEach((y) => {
    for (let x = 0; x < COLS; x++) burst(x, y, G.board[y][x], 5);
  });
  scoreLines(rows, !fromLock);
  if (fromLock) {
    G.state = 'CLEARING';
    G.clearing = { rows, t: 0 };
  } else {
    removeRows(rows);
    unstickPiece();
  }
}
function scoreLines(rows, passive) {
  const n = rows.length;
  let pts = ([0, 100, 300, 500, 800][n] || 1200) * G.level;
  let tag = '';
  if (!passive) {
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (G.combo > 0) pts += 50 * G.combo * G.level;
    if (n >= 4) {
      if (G.b2b) {
        pts = Math.floor(pts * 1.5);
        tag = 'B2B ';
      }
      G.b2b = true;
    } else G.b2b = false;
  }
  if (isFever()) pts *= 2;
  addScore(pts);
  const cy = rows.reduce((a, b) => a + b, 0) / n;
  G.popups.push({ text: '+' + pts.toLocaleString(), x: 200, y: cy * BS + 20, life: 900, max: 900, color: isFever() ? '#ffc94a' : '#fff' });

  G.lines += n;
  G.levelLines += n;
  if (G.levelLines >= LINES_PER_LEVEL) G.levelUpPending = true;

  const comboTxt = !passive && G.combo > 0 ? `${G.combo} 连击!` : '';
  if (n >= 4) {
    S.tetris(G.combo);
    boardFx('shake-l');
    flash();
    showAction('痛快!', tag + comboTxt, '#ff4d5e');
    setTimeout(() => TTS.speak('痛快！', 1), 120);
  } else {
    S.clear(n, passive ? 0 : G.combo);
    boardFx(n >= 2 ? 'shake-m' : 'shake-s');
    if (n === 3) showAction('三消!', comboTxt, '#b65cff');
    else if (n === 2) showAction('双消!', comboTxt, '#2fe6ff');
    else if (comboTxt) showAction(comboTxt, '', '#ff9a2e');
  }
  updateHUD();
}
function addScore(pts, quiet) {
  G.score += Math.round(pts);
  const el = $('score');
  el.textContent = G.score.toLocaleString();
  if (!quiet) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}
function finishTurn() {
  if (G.state === 'GAME_OVER') return;
  if (G.levelUpPending) {
    G.levelUpPending = false;
    return showLevelClear();
  }
  if (G.quizPending) {
    G.quizPending = false;
    return startQuiz();
  }
  spawnNext();
}
// 보드가 바뀐 뒤 현재 블록이 겹치면 위로 밀어 올림
function unstickPiece() {
  const p = G.piece;
  if (!p) return;
  let n = 0;
  while (collide(p) && n < 4) {
    p.y--;
    n++;
  }
  if (collide(p)) gameOver();
}

/* ---------------- 6. 아이템 · 방해 이벤트 ---------------- */
function applyItems(p) {
  let type = 0, ix = 0, iy = 0;
  eachCell(p, (x, y, v) => {
    if (isItem(v)) {
      type = v;
      ix = x;
      iy = y;
    }
  });
  if (!type) return false;
  const run = G.runId;
  if (type === 10) {
    S.bomb();
    boardFx('shake-l');
    flash('#ff8a3d');
    for (let y = iy - 1; y <= iy + 1; y++)
      for (let x = ix - 1; x <= ix + 1; x++)
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
          if (G.board[y][x]) burst(x, y, G.board[y][x], 7);
          G.board[y][x] = 0;
        }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 7;
      G.particles.push({ x: ix * BS + 20, y: iy * BS + 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 700, max: 700, color: i % 2 ? '#ffd93b' : '#ff4560', size: 6 });
    }
    dropFloating();
  } else if (type === 11) {
    S.gravity();
    boardFx('shake-m');
    G.board[iy][ix] = 0;
    for (let x = 0; x < COLS; x++) {
      const col = [];
      for (let y = ROWS - 1; y >= 0; y--) if (G.board[y][x]) col.push(G.board[y][x]);
      for (let y = ROWS - 1; y >= 0; y--) G.board[y][x] = col.length ? col.shift() : 0;
    }
  } else if (type === 17) {
    S.zap();
    boardFx('shake-m');
    flash('#fff6a0');
    G.board[iy][ix] = 0;
    const rows = [ROWS - 1, ROWS - 2];
    rows.forEach((y) => {
      for (let x = 0; x < COLS; x++) if (G.board[y][x]) burst(x, y, G.board[y][x], 5);
    });
    removeRows(rows);
    addScore(200 * G.level);
  }
  if (run === G.runId) showNotice(ITEM_NAME[type], COLORS[type]);
  return true;
}
// 폭탄 이후 바닥과 연결되지 않은 블록 떨어뜨리기
function dropFloating() {
  const seen = createBoard();
  const q = [];
  for (let x = 0; x < COLS; x++)
    if (G.board[ROWS - 1][x]) {
      seen[ROWS - 1][x] = 1;
      q.push([x, ROWS - 1]);
    }
  while (q.length) {
    const [cx, cy] = q.shift();
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && G.board[ny][nx] && !seen[ny][nx]) {
        seen[ny][nx] = 1;
        q.push([nx, ny]);
      }
    });
  }
  for (let x = 0; x < COLS; x++)
    for (let y = ROWS - 2; y >= 0; y--)
      if (G.board[y][x] && !seen[y][x]) {
        let d = y;
        while (d + 1 < ROWS && !G.board[d + 1][x]) d++;
        if (d !== y) {
          G.board[d][x] = G.board[y][x];
          G.board[y][x] = 0;
        }
      }
}
function grantItem() {
  const t = [10, 11, 17][Math.floor(Math.random() * 3)];
  G.queue.unshift(newPiece(t));
  S.item();
  const run = G.runId;
  setTimeout(() => run === G.runId && showNotice('🎁 아이템 획득!', '#ffc94a'), 600);
  drawPreviews();
}
function addPenaltyLine() {
  if (G.board[0].some((v) => v)) return gameOver();
  G.board.shift();
  const row = new Array(COLS).fill(9);
  row[Math.floor(Math.random() * COLS)] = 0;
  G.board.push(row);
  S.penalty();
  boardFx('shake-m');
}
function spawnSky() {
  const n = G.mode === 'HELL' ? 1 + Math.floor(Math.random() * Math.min(3, 1 + G.level / 2)) : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(Math.random() * COLS);
    if (!G.board[0][x]) G.sky.push({ x, y: -1 - Math.random() * 2 });
  }
  if (G.sky.length) {
    S.warn();
    showNotice('⚠️ 乱石穿空!', '#ff9a2e');
  }
}
function updateSky(dt) {
  let changed = false;
  for (let i = G.sky.length - 1; i >= 0; i--) {
    const g = G.sky[i];
    g.y += dt / 42;
    const cy = Math.floor(g.y);
    const below = cy + 1;
    const hit = below >= ROWS || (below >= 0 && (G.board[below][g.x] || pieceAt(g.x, below)));
    if (hit) {
      let ly = Math.min(cy, ROWS - 1);
      while (ly >= 0 && (G.board[ly][g.x] || pieceAt(g.x, ly))) ly--;
      if (ly >= 0) {
        G.board[ly][g.x] = 8;
        S.sand();
        changed = true;
      }
      G.sky.splice(i, 1);
    }
  }
  G.sandTimer += dt;
  if (G.sandTimer > 60) {
    G.sandTimer = 0;
    for (let y = ROWS - 2; y >= 0; y--)
      for (let x = 0; x < COLS; x++)
        if (G.board[y][x] === 8 && !G.board[y + 1][x] && !pieceAt(x, y + 1)) {
          G.board[y + 1][x] = 8;
          G.board[y][x] = 0;
          changed = true;
        }
  }
  if (changed) resolveLines(false);
}
function randomEvent() {
  if (Math.random() > 0.3 + G.level * 0.05) return;
  if (Math.random() < 0.5) {
    G.reversedUntil = G.clock + 6000;
    S.warn();
    boardFx('shake-m');
    showNotice('⚠️ 声东击西!\n좌우 반전', '#ff4d5e');
  } else {
    S.quake();
    boardFx('shake-l');
    showNotice('⚠️ 天崩地裂!', '#d06bff');
    const start = ROWS - 4;
    let count = 0;
    for (let y = start; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (G.board[y][x]) {
          count++;
          G.board[y][x] = 0;
        }
    const slots = [];
    for (let y = start; y < ROWS; y++) for (let x = 0; x < COLS; x++) slots.push([x, y]);
    shuffle(slots)
      .slice(0, count)
      .forEach(([x, y]) => (G.board[y][x] = 9));
    unstickPiece();
    resolveLines(false);
  }
}
function startFever() {
  G.feverUntil = G.clock + FEVER_MS;
  S.fever();
  const run = G.runId;
  setTimeout(() => run === G.runId && showNotice('🔥 FEVER ×2', '#ffc94a'), 900);
}
function generateObstacles(lvl) {
  if (lvl < 2 || G.mode === 'PRACTICE') return;
  const h = Math.min(8, Math.floor(lvl * 1.2));
  for (let y = ROWS - h; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (Math.random() < 0.38) G.board[y][x] = 9;
    if (G.board[y].every((v) => v)) G.board[y][Math.floor(Math.random() * COLS)] = 0;
  }
}

/* ---------------- 7. 퀴즈 ---------------- */
const QUIZ_TYPES = {
  kr2cn: '한 → 중',
  cn2kr: '중 → 한',
  listen: '🎧 듣기',
};
function startQuiz() {
  G.state = 'QUIZ';
  G.softDrop = false;
  BGM.setDuck(0.3);
  if (!G.quizPool.length) G.quizPool = shuffle([...VOCAB_LIST]);
  const q = G.quizPool.pop();

  const types = ['kr2cn', 'kr2cn', 'cn2kr'];
  if (TTS.available && settings.tts && !settings.muted) types.push('listen', 'listen');
  const type = types[Math.floor(Math.random() * types.length)];

  const pool = shuffle(VOCAB_LIST.filter((v) => v.cn !== q.cn && v.kr !== q.kr));
  // 비슷한 길이의 오답을 우선 (너무 쉽지 않게)
  pool.sort((a, b) => Math.abs(a.cn.length - q.cn.length) - Math.abs(b.cn.length - q.cn.length));
  const wrongs = shuffle(pool.slice(0, 6)).slice(0, 2);
  const options = shuffle([q, ...wrongs]);
  const correct = options.indexOf(q);

  G.quiz = { q, type, options, correct, start: performance.now(), dur: cfg().quizTime, answered: false, lastTick: 99 };

  $('quiz-type').textContent = QUIZ_TYPES[type];
  $('quiz-streak').textContent = G.streak > 0 ? `连对 ×${G.streak}` : '';
  const word = $('quiz-word');
  const sub = $('quiz-sub');
  word.className = '';
  $('quiz-listen').classList.toggle('hidden', type === 'kr2cn');
  if (type === 'kr2cn') {
    word.textContent = q.kr;
    sub.textContent = '알맞은 중국어를 고르세요';
  } else if (type === 'cn2kr') {
    word.textContent = q.cn;
    word.className = 'cn';
    sub.textContent = q.py;
  } else {
    word.textContent = '🔊';
    word.className = 'listen';
    sub.textContent = '잘 듣고 뜻을 고르세요';
  }

  const box = $('quiz-options');
  box.innerHTML = '';
  options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    const main = document.createElement('span');
    main.className = 'main';
    if (type === 'kr2cn') {
      main.classList.add('cn');
      main.textContent = o.cn;
      const py = document.createElement('span');
      py.className = 'py';
      py.textContent = o.py;
      main.appendChild(py);
    } else {
      main.textContent = o.kr;
    }
    b.append(num, main);
    b.addEventListener('click', () => answerQuiz(i));
    box.appendChild(b);
  });
  $('quiz-timer-fill').style.width = '100%';
  showOverlay('quiz-ui');
  S.quiz();
  if (type !== 'kr2cn') setTimeout(() => G.state === 'QUIZ' && TTS.speak(q.cn), 300);
}
function updateQuiz(now) {
  const z = G.quiz;
  if (!z || z.answered) return;
  const left = Math.max(0, z.dur - (now - z.start));
  $('quiz-timer-fill').style.width = (left / z.dur) * 100 + '%';
  const sec = Math.ceil(left / 1000);
  if (sec <= 3 && sec < z.lastTick && left > 0) {
    z.lastTick = sec;
    S.tick();
  }
  if (left <= 0) answerQuiz(-1);
}
function answerQuiz(i) {
  const z = G.quiz;
  if (G.state !== 'QUIZ' || !z || z.answered) return;
  z.answered = true;
  const ok = i === z.correct;
  const btns = document.querySelectorAll('#quiz-options .opt');
  btns.forEach((b, k) => b.classList.add(k === z.correct ? 'correct' : k === i ? 'wrong' : 'dim'));
  if (z.type === 'listen') {
    $('quiz-word').textContent = z.q.cn;
    $('quiz-word').className = 'cn';
    $('quiz-sub').textContent = z.q.py;
  }
  G.quizTotal++;
  G.lvQuizTotal++;
  const practice = G.mode === 'PRACTICE';
  if (ok) {
    S.correct();
    G.quizRight++;
    G.lvQuizRight++;
    G.streak++;
    const frac = Math.max(0, 1 - (performance.now() - z.start) / z.dur);
    let pts = Math.round((50 + 150 * frac) * G.level);
    if (isFever()) pts *= 2;
    addScore(pts);
    showNotice('答对! +' + pts, '#2de0a7');
    G.gauge++;
    if (G.streak % 3 === 0) startFever();
    if (G.gauge >= 5) {
      G.gauge = 0;
      grantItem();
    }
  } else {
    S.wrong();
    G.streak = 0;
    if (!practice) G.gauge = 0;
    G.missed.set(z.q.cn, z.q);
    showNotice(i < 0 ? '超时!' : '答错!', '#ff4d5e');
  }
  setTimeout(() => TTS.speak(z.q.cn), 200);
  updateHUD();
  const run = G.runId;
  setTimeout(
    () => {
      if (run !== G.runId || G.state !== 'QUIZ') return;
      hideOverlay('quiz-ui');
      BGM.setDuck(1);
      if (!ok && !practice) addPenaltyLine();
      if (G.state !== 'GAME_OVER') spawnNext();
    },
    ok ? 950 : practice ? 2400 : 1600,
  );
}

/* ---------------- 8. 그리기 ---------------- */
const cv = $('tetris');
const ctx = cv.getContext('2d');
const fx = $('fx').getContext('2d');
const holdCtx = $('hold-canvas').getContext('2d');
const nextCtx = $('next-canvas').getContext('2d');
const boardWrap = $('board-wrap');

function drawCell(c, v, x, y, size = BS, alpha = 1) {
  c.globalAlpha = alpha;
  c.drawImage(sprite(v, size), x, y);
  c.globalAlpha = 1;
}
function render(now) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  // 격자
  ctx.strokeStyle = G.mode === 'HELL' ? 'rgba(255,80,60,0.07)' : 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * BS + 0.5, 0);
    ctx.lineTo(x * BS + 0.5, ROWS * BS);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * BS + 0.5);
    ctx.lineTo(COLS * BS, y * BS + 0.5);
  }
  ctx.stroke();

  if (!G.board) return;
  const p = G.piece;
  const playing = G.state === 'PLAYING';

  // 현재 블록 아래 세로 가이드
  if (p && playing) {
    let minX = 99, maxX = -1;
    eachCell(p, (x) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    });
    const g = ctx.createLinearGradient(0, 0, 0, ROWS * BS);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(minX * BS, 0, (maxX - minX + 1) * BS, ROWS * BS);
  }

  // 위험 구역 표시
  ctx.fillStyle = 'rgba(255,60,60,0.06)';
  ctx.fillRect(0, 0, COLS * BS, 2 * BS);

  // 쌓인 블록
  const clearRows = G.clearing ? G.clearing.rows : null;
  const k = G.clearing ? G.clearing.t / CLEAR_MS : 0;
  const greyUntil = G.state === 'GAME_OVER' ? ROWS - Math.floor(G.overT / 35) : ROWS + 1;
  const pulse = 0.75 + 0.25 * Math.sin(now / 150);
  for (let y = 0; y < ROWS; y++) {
    const isClr = clearRows && clearRows.includes(y);
    for (let x = 0; x < COLS; x++) {
      const v = G.board[y][x];
      if (!v) continue;
      if (isClr) drawCell(ctx, v, x * BS, y * BS, BS, 1 - k);
      else if (y >= greyUntil) drawCell(ctx, 9, x * BS, y * BS, BS, 0.8);
      else drawCell(ctx, v, x * BS, y * BS, BS, isItem(v) ? pulse : 1);
    }
    if (isClr) {
      ctx.fillStyle = `rgba(255,255,255,${0.95 * (1 - k)})`;
      const w = COLS * BS * (1 - k);
      ctx.fillRect((COLS * BS - w) / 2, y * BS + BS * 0.1 * k, w, BS * (1 - 0.2 * k));
    }
  }

  // 고스트
  if (p && playing && settings.ghost) {
    const gy = ghostY(p);
    if (gy !== p.y) {
      const col = COLORS[p.matrix.flat().find((v) => v)];
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.fillStyle = col;
      p.matrix.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          const x = (p.x + c) * BS, y = (gy + r) * BS;
          if (y < 0) return;
          ctx.globalAlpha = 0.14;
          rrect(ctx, x + 3, y + 3, BS - 6, BS - 6, 7);
          ctx.fill();
          ctx.globalAlpha = 0.55;
          ctx.stroke();
        }),
      );
      ctx.restore();
    }
  }

  // 현재 블록
  if (p && (playing || G.state === 'PAUSED')) {
    const lockFade = collide(p, 0, 1) ? 1 - 0.35 * (G.lockAcc / cfg().lock) : 1;
    eachCell(p, (x, y, v) => {
      if (y >= 0) drawCell(ctx, v, x * BS, y * BS, BS, isItem(v) ? pulse : lockFade);
    });
  }
  // 낙석
  G.sky.forEach((g) => {
    if (g.y > -1) drawCell(ctx, 8, g.x * BS, g.y * BS);
  });

  renderFx();
}
function renderFx() {
  fx.clearRect(0, 0, 400, 800);
  G.trails.forEach((t) => {
    const a = t.life / t.max;
    const g = fx.createLinearGradient(0, t.y0 * BS, 0, t.y1 * BS + BS);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, t.color);
    fx.globalAlpha = a * 0.5;
    fx.fillStyle = g;
    fx.fillRect(t.x * BS + 6, Math.max(0, t.y0 * BS), BS - 12, (t.y1 - t.y0) * BS + BS);
  });
  G.particles.forEach((q) => {
    fx.globalAlpha = Math.max(0, q.life / q.max);
    fx.fillStyle = q.color;
    fx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  });
  fx.globalAlpha = 1;
  fx.textAlign = 'center';
  fx.font = '700 28px "Chakra Petch", Consolas, monospace';
  G.popups.forEach((q) => {
    const a = q.life / q.max;
    fx.globalAlpha = Math.min(1, a * 2);
    fx.lineWidth = 4;
    fx.strokeStyle = 'rgba(0,0,0,0.7)';
    const y = q.y - (1 - a) * 50;
    fx.strokeText(q.text, q.x, y);
    fx.fillStyle = q.color;
    fx.fillText(q.text, q.x, y);
  });
  fx.globalAlpha = 1;
  if (G.flash > 0) {
    fx.fillStyle = G.flashColor || '#fff';
    fx.globalAlpha = G.flash * 0.45;
    fx.fillRect(0, 0, 400, 800);
    fx.globalAlpha = 1;
  }
}
function updateFx(dt) {
  const f = dt / 16.7;
  G.particles = G.particles.filter((q) => {
    q.x += q.vx * f;
    q.y += q.vy * f;
    q.vy += 0.35 * f;
    q.life -= dt;
    return q.life > 0;
  });
  G.popups = G.popups.filter((q) => (q.life -= dt) > 0);
  G.trails = G.trails.filter((q) => (q.life -= dt) > 0);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 250);
}
function burst(x, y, v, n) {
  const color = COLORS[v] || '#fff';
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x: x * BS + Math.random() * BS,
      y: y * BS + Math.random() * BS,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 6 - 1,
      life: 500 + Math.random() * 400,
      max: 900,
      color,
      size: 4 + Math.random() * 5,
    });
  }
}
function flash(color) {
  G.flash = 1;
  G.flashColor = color || '#fff';
}
function boardFx(cls) {
  boardWrap.classList.remove('shake-s', 'shake-m', 'shake-l', 'thump');
  void boardWrap.offsetWidth;
  boardWrap.classList.add(cls);
}

function drawPieceIn(c, type, cx, cy, size, alpha = 1) {
  const m = SHAPES[type];
  let minR = 9, maxR = -1, minC = 9, maxC = -1;
  m.forEach((row, r) =>
    row.forEach((v, cc) => {
      if (!v) return;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, cc);
      maxC = Math.max(maxC, cc);
    }),
  );
  const w = (maxC - minC + 1) * size, h = (maxR - minR + 1) * size;
  m.forEach((row, r) =>
    row.forEach((v, cc) => {
      if (v) drawCell(c, v, Math.round(cx - w / 2 + (cc - minC) * size), Math.round(cy - h / 2 + (r - minR) * size), size, alpha);
    }),
  );
}
function drawPreviews() {
  holdCtx.clearRect(0, 0, 160, 110);
  if (G.hold) drawPieceIn(holdCtx, G.hold.type, 80, 55, 30, G.holdUsed ? 0.35 : 1);
  nextCtx.clearRect(0, 0, 160, 330);
  (G.queue || []).slice(0, 3).forEach((p, i) => {
    drawPieceIn(nextCtx, p.type, 80, 55 + i * 110, i === 0 ? 32 : 26, i === 0 ? 1 : 0.75);
  });
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  if (!G.board) return;
  $('score').textContent = (G.score || 0).toLocaleString();
  $('level').textContent = G.level;
  $('lines-left').textContent = Math.max(0, LINES_PER_LEVEL - G.levelLines);
  $('level-fill').style.width = Math.min(100, (G.levelLines / LINES_PER_LEVEL) * 100) + '%';
  document.querySelectorAll('#gauge-slots .slot').forEach((s, i) => s.classList.toggle('filled', i < G.gauge));
  $('streak-num').textContent = G.streak;
  $('combo').textContent = Math.max(0, G.combo);
  $('accuracy').textContent = G.quizTotal ? Math.round((G.quizRight / G.quizTotal) * 100) + '%' : '-';
  const fever = isFever();
  $('streak-card').classList.toggle('fever', fever);
  boardWrap.classList.toggle('fever', fever);
  $('fever-fill').style.width = (fever ? ((G.feverUntil - G.clock) / FEVER_MS) * 100 : ((G.streak % 3) / 3) * 100) + '%';
  $('fever-hint').textContent = fever ? `FEVER! ${Math.ceil((G.feverUntil - G.clock) / 1000)}초 남음` : '3연속 정답 → FEVER ×2';
  let danger = false;
  for (let y = 0; y < 4 && !danger; y++) danger = G.board[y].some((v) => v);
  boardWrap.classList.toggle('danger', danger && G.state !== 'GAME_OVER' && !fever);
  // 상태 칩
  const chips = [];
  if (G.reversedUntil > G.clock) chips.push(`<span class="chip" style="color:#ff4d5e">⇄ 좌우반전 ${Math.ceil((G.reversedUntil - G.clock) / 1000)}</span>`);
  if (fever) chips.push(`<span class="chip" style="color:#ffc94a">🔥 FEVER ×2</span>`);
  const html = chips.join('');
  const box = $('status-chips');
  if (box.innerHTML !== html) box.innerHTML = html;
}

let actionTimer = null;
function showAction(main, sub, color) {
  const el = $('action-text');
  el.innerHTML = '';
  el.append(document.createTextNode(main));
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    el.appendChild(s);
  }
  el.style.color = color;
  el.classList.remove('hidden', 'pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => el.classList.add('hidden'), 1300);
}
let noticeTimer = null;
function showNotice(text, color) {
  const el = $('notice-text');
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('hidden', 'pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.add('hidden'), 1300);
}

/* ---------------- 9. 메인 루프 ---------------- */
const keys = { left: false, right: false };
let dasDir = 0, dasT = 0, arrT = 0;
let lastFrame = performance.now();
let hudT = 0;

function updatePlaying(dt) {
  G.clock += dt;
  const c = cfg();
  if (c.sky) {
    G.skyTimer += dt;
    const interval = Math.max(G.mode === 'HELL' ? 3500 : 8000, c.sky - (G.level - 1) * 1500);
    if (G.skyTimer > interval) {
      G.skyTimer = 0;
      spawnSky();
    }
  }
  if (G.mode === 'HELL') {
    G.eventTimer += dt;
    if (G.eventTimer > 15000) {
      G.eventTimer = 0;
      randomEvent();
    }
  }
  if (G.reversedUntil && G.clock > G.reversedUntil) {
    G.reversedUntil = 0;
    showNotice('✅ 拨云见日!', '#2de0a7');
  }
  updateSky(dt);
  if (G.state !== 'PLAYING' || !G.piece) return;

  // 좌우 자동 반복 (DAS / ARR)
  if (dasDir) {
    dasT += dt;
    if (dasT > DAS) {
      arrT += dt;
      while (arrT >= ARR) {
        arrT -= ARR;
        if (!tryMove(dasDir)) break;
      }
    }
  }
  const p = G.piece;
  const interval = G.softDrop ? Math.min(SOFT_MS, G.dropInterval) : G.dropInterval;
  if (!collide(p, 0, 1)) {
    G.lockAcc = 0;
    G.dropAcc += dt;
    while (G.dropAcc >= interval) {
      G.dropAcc -= interval;
      if (collide(p, 0, 1)) break;
      p.y++;
      if (G.softDrop) {
        addScore(1, true);
        S.soft();
      }
    }
  } else {
    G.dropAcc = 0;
    G.lockAcc += dt;
    if (G.lockAcc >= cfg().lock) lockPiece();
  }
}
function loop(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  if (G.state === 'PLAYING') updatePlaying(dt);
  else if (G.state === 'CLEARING') {
    G.clearing.t += dt;
    if (G.clearing.t >= CLEAR_MS) {
      removeRows(G.clearing.rows);
      G.clearing = null;
      if (G.board.every((r) => r.every((v) => !v))) {
        const bonus = 2000 * G.level;
        addScore(bonus);
        S.allClear();
        showAction('全清!', '+' + bonus, '#ffc94a');
      }
      updateHUD();
      finishTurn();
    }
  } else if (G.state === 'QUIZ') updateQuiz(now);
  else if (G.state === 'GAME_OVER') G.overT += dt;

  if (G.state !== 'PAUSED') updateFx(dt);
  hudT += dt;
  if (hudT > 200) {
    hudT = 0;
    if (G.state === 'PLAYING') updateHUD();
  }
  render(now);
  requestAnimationFrame(loop);
}

/* ---------------- 키 입력 ---------------- */
function anyOpen(id) {
  return !$(id).classList.contains('hidden');
}
document.addEventListener('keydown', (e) => {
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') {
    if (code === 'Enter') $('save-rank-btn').click();
    return;
  }
  if (anyOpen('intro-ui')) return closeIntro();

  if (code === 'KeyM' && !e.repeat) return toggleMute();

  // 설정 / 방법 / 랭킹 창 닫기
  for (const id of ['settings-ui', 'howto-ui', 'ranking-ui']) {
    if (anyOpen(id)) {
      if (code === 'Escape' || (code === 'Enter' && id !== 'ranking-ui')) hideOverlay(id);
      return;
    }
  }

  if (G.state === 'IDLE' && anyOpen('lobby-ui')) {
    const m = { Digit1: 'PRACTICE', Digit2: 'NORMAL', Digit3: 'HELL' }[code];
    if (m) startGame(m);
    return;
  }
  if (G.state === 'QUIZ') {
    const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
    if (idx !== undefined) answerQuiz(idx);
    if (code === 'KeyR' && G.quiz && G.quiz.type !== 'kr2cn') TTS.speak(G.quiz.q.cn);
    return;
  }
  if (G.state === 'LEVEL_CLEAR') {
    if ((code === 'Enter' || code === 'Space') && anyOpen('level-clear-ui')) nextLevel();
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (G.state !== 'PLAYING' || !G.piece) return;

  switch (code) {
    case 'ArrowLeft':
      if (e.repeat) return;
      keys.left = true;
      dasDir = -1;
      dasT = arrT = 0;
      tryMove(-1);
      break;
    case 'ArrowRight':
      if (e.repeat) return;
      keys.right = true;
      dasDir = 1;
      dasT = arrT = 0;
      tryMove(1);
      break;
    case 'ArrowDown':
      if (e.repeat) return;
      G.softDrop = true;
      G.dropAcc = Math.max(G.dropAcc, SOFT_MS);
      break;
    case 'ArrowUp':
    case 'KeyX':
      if (!e.repeat) rotate(1);
      break;
    case 'KeyZ':
    case 'ControlLeft':
      if (!e.repeat) rotate(-1);
      break;
    case 'Space':
      if (!e.repeat) hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      if (!e.repeat) holdPiece();
      break;
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') {
    keys.left = false;
    if (dasDir === -1) dasDir = keys.right ? 1 : 0;
    dasT = arrT = 0;
  } else if (e.code === 'ArrowRight') {
    keys.right = false;
    if (dasDir === 1) dasDir = keys.left ? -1 : 0;
    dasT = arrT = 0;
  } else if (e.code === 'ArrowDown') G.softDrop = false;
});
window.addEventListener('blur', () => {
  keys.left = keys.right = false;
  dasDir = 0;
  G.softDrop = false;
  if (G.state === 'PLAYING') togglePause();
});

/* ---------------- 10. 화면 전환 ---------------- */
const OVERLAYS = ['intro-ui', 'lobby-ui', 'howto-ui', 'quiz-ui', 'pause-ui', 'level-clear-ui', 'game-over-ui', 'ranking-ui', 'settings-ui'];
function showOverlay(id) {
  $(id).classList.remove('hidden');
}
function hideOverlay(id) {
  $(id).classList.add('hidden');
}
function hideAll() {
  OVERLAYS.forEach(hideOverlay);
}
function setModeLook(mode) {
  document.body.dataset.mode = mode;
  $('mode-badge').textContent = mode === 'LOBBY' ? 'LOBBY' : MODE_CFG[mode].label;
}

function closeIntro() {
  if (!anyOpen('intro-ui')) return;
  Sound.init();
  TTS.choose();
  S.ui();
  hideOverlay('intro-ui');
  showLobby();
}
function showLobby() {
  G.runId++;
  G.state = 'IDLE';
  G.piece = null;
  if (window.speechSynthesis) speechSynthesis.cancel();
  hideAll();
  setModeLook('LOBBY');
  boardWrap.className = '';
  $('status-chips').innerHTML = '';
  $('countdown').classList.add('hidden');
  showOverlay('lobby-ui');
  BGM.setDuck(1);
  BGM.play('lobby');
}
function startGame(mode) {
  if (document.activeElement) document.activeElement.blur();
  hideAll();
  resetGame(mode);
  setModeLook(mode);
  boardWrap.className = '';
  updateHUD();
  drawPreviews();
  G.levelStart = performance.now();
  BGM.setDuck(1);
  BGM.play(mode);
  countdown(() => spawnNext());
}
function countdown(done) {
  G.state = 'COUNTDOWN';
  const el = $('countdown');
  const run = G.runId;
  const steps = ['3', '2', '1', 'GO!'];
  el.classList.remove('hidden');
  steps.forEach((s, i) => {
    setTimeout(() => {
      if (run !== G.runId) return;
      el.innerHTML = `<span>${s}</span>`;
      S.count(i === 3);
      if (i === 3) TTS.speak('开始！', 1);
    }, i * 650);
  });
  setTimeout(() => {
    if (run !== G.runId) return;
    el.classList.add('hidden');
    lastFrame = performance.now();
    done();
  }, steps.length * 650);
}
function togglePause() {
  if (G.state === 'PAUSED') {
    hideOverlay('pause-ui');
    G.state = G.prevState;
    lastFrame = performance.now();
    BGM.resume();
  } else if (G.state === 'PLAYING' || G.state === 'CLEARING') {
    G.prevState = G.state;
    G.state = 'PAUSED';
    G.softDrop = false;
    dasDir = 0;
    showOverlay('pause-ui');
    BGM.pause();
  }
}
function showLevelClear() {
  G.state = 'LEVEL_CLEAR';
  G.sky = [];
  S.levelUp();
  TTS.speak('过关！', 1);
  const sec = Math.floor((performance.now() - G.levelStart) / 1000);
  $('clear-level').textContent = G.level;
  $('level-time').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  $('level-combo').textContent = G.maxCombo;
  $('level-score').textContent = (G.score - G.levelScoreStart).toLocaleString();
  $('level-quiz').textContent = `${G.lvQuizRight}/${G.lvQuizTotal}`;
  const run = G.runId;
  setTimeout(() => run === G.runId && showOverlay('level-clear-ui'), 700);
}
function nextLevel() {
  if (G.state !== 'LEVEL_CLEAR') return;
  hideOverlay('level-clear-ui');
  G.level++;
  G.levelLines = 0;
  G.maxCombo = 0;
  G.combo = -1;
  G.lvQuizRight = G.lvQuizTotal = 0;
  G.levelScoreStart = G.score;
  G.levelStart = performance.now();
  G.reversedUntil = 0;
  G.eventTimer = 0;
  G.skyTimer = 0;
  G.board = createBoard();
  generateObstacles(G.level);
  G.dropInterval = cfg().speed(G.level);
  updateHUD();
  BGM.play(G.mode);
  countdown(() => spawnNext());
}
function gameOver() {
  if (G.state === 'GAME_OVER') return;
  G.state = 'GAME_OVER';
  G.overT = 0;
  G.piece = null;
  G.sky = [];
  hideOverlay('quiz-ui');
  BGM.setDuck(1);
  S.over();
  BGM.play('over');
  boardFx('shake-l');
  $('final-score').textContent = G.score.toLocaleString();
  $('final-level').textContent = G.level;
  $('final-lines').textContent = G.lines;
  $('final-acc').textContent = G.quizTotal ? Math.round((G.quizRight / G.quizTotal) * 100) + '%' : '-';
  const list = $('review-list');
  list.innerHTML = '';
  if (!G.missed.size) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = G.quizTotal ? '틀린 단어가 없어요! 完美 👏' : '이번 판에는 퀴즈가 없었어요.';
    list.appendChild(li);
  }
  G.missed.forEach((q) => {
    const li = document.createElement('li');
    li.title = '발음 듣기';
    const left = document.createElement('div');
    const cn = document.createElement('div');
    cn.className = 'rv-cn';
    cn.textContent = '🔊 ' + q.cn;
    const py = document.createElement('div');
    py.className = 'rv-py';
    py.textContent = q.py;
    left.append(cn, py);
    const kr = document.createElement('div');
    kr.className = 'rv-kr';
    kr.textContent = q.kr;
    li.append(left, kr);
    li.addEventListener('click', () => TTS.speak(q.cn));
    list.appendChild(li);
  });
  const canRank = G.mode !== 'PRACTICE';
  $('save-row').classList.toggle('hidden', !canRank);
  $('player-name').value = loadJSON('cntetris_lastname', '');
  const run = G.runId;
  setTimeout(() => {
    if (run !== G.runId) return;
    showOverlay('game-over-ui');
    if (canRank) $('player-name').focus();
  }, 1000);
}

/* ---------------- 랭킹 ---------------- */
const rankKey = (m) => `tetris_rank_${m}`;
function getRankings(mode) {
  const r = loadJSON(rankKey(mode), []);
  return Array.isArray(r) ? r : [];
}
function renderRankings(mode, highlight = -1) {
  $('tab-normal').classList.toggle('active', mode === 'NORMAL');
  $('tab-hell').classList.toggle('active', mode === 'HELL');
  const list = $('rank-list');
  list.innerHTML = '';
  const ranks = getRankings(mode);
  if (!ranks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
    list.appendChild(li);
    return;
  }
  ranks.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'me';
    [
      ['rk', i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1],
      ['nm', r.name],
      ['sc', Number(r.score).toLocaleString()],
      ['lv', 'Lv.' + r.level],
    ].forEach(([cls, txt]) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = txt;
      li.appendChild(s);
    });
    list.appendChild(li);
  });
}
$('save-rank-btn').addEventListener('click', () => {
  const name = $('player-name').value.trim().slice(0, 6) || '무명';
  saveJSON('cntetris_lastname', name);
  const ranks = getRankings(G.mode);
  const rec = { name, score: G.score, level: G.level, date: new Date().toLocaleDateString(), t: Date.now() };
  ranks.push(rec);
  ranks.sort((a, b) => b.score - a.score);
  const top = ranks.slice(0, 10);
  saveJSON(rankKey(G.mode), top);
  $('save-row').classList.add('hidden');
  renderRankings(G.mode, top.indexOf(rec));
  showOverlay('ranking-ui');
  S.correct();
});
$('tab-normal').addEventListener('click', () => renderRankings('NORMAL'));
$('tab-hell').addEventListener('click', () => renderRankings('HELL'));
$('close-rank-btn').addEventListener('click', () => hideOverlay('ranking-ui'));
$('btn-open-rank').addEventListener('click', () => {
  renderRankings('NORMAL');
  showOverlay('ranking-ui');
});

/* ---------------- 설정 ---------------- */
function fillVoiceSelect() {
  const sel = $('set-voice');
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = '자동 선택 (Tingting 우선)';
  sel.appendChild(auto);
  TTS.voices.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  sel.value = settings.voice || '';
  const note = $('voice-note');
  const v = TTS.voice;
  if (!v) {
    note.textContent = '이 컴퓨터에서 중국어 음성을 찾지 못했어요. Chrome에서 실행하고 인터넷에 연결되어 있는지 확인해 주세요. (듣기 문제는 자동으로 빠져요)';
  } else if (/ting/i.test(v.name)) {
    note.textContent = `✅ 지금 음성: ${v.name}`;
  } else {
    note.textContent = `지금 음성: ${v.name}\nTingting은 Mac·iPhone에 들어 있는 음성이라, Windows에서는 가장 비슷한 중국어 여성 음성을 자동으로 써요.`;
  }
}
function openSettings() {
  if (G.state === 'PLAYING' || G.state === 'CLEARING') togglePause();
  $('set-bgm').value = settings.bgm;
  $('set-sfx').value = settings.sfx;
  $('set-tts').checked = settings.tts;
  $('set-rate').value = settings.rate;
  $('set-ghost').checked = settings.ghost;
  TTS.choose();
  fillVoiceSelect();
  showOverlay('settings-ui');
}
$('set-bgm').addEventListener('input', (e) => {
  settings.bgm = +e.target.value;
  BGM.refresh();
  saveSettings();
});
$('set-sfx').addEventListener('input', (e) => {
  settings.sfx = +e.target.value;
  Sound.setVolume();
  saveSettings();
});
$('set-sfx').addEventListener('change', () => S.correct());
$('set-tts').addEventListener('change', (e) => {
  settings.tts = e.target.checked;
  saveSettings();
});
$('set-rate').addEventListener('input', (e) => {
  settings.rate = +e.target.value;
  saveSettings();
});
$('set-rate').addEventListener('change', () => TTS.speak('你好，我们一起学中文吧！'));
$('set-ghost').addEventListener('change', (e) => {
  settings.ghost = e.target.checked;
  saveSettings();
});
$('set-voice').addEventListener('change', (e) => {
  settings.voice = e.target.value;
  saveSettings();
  TTS.choose();
  fillVoiceSelect();
  TTS.speak('你好！');
});
$('btn-test-voice').addEventListener('click', () => TTS.speak('你好，我们一起学中文吧！'));

function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  Sound.setVolume();
  BGM.refresh();
  if (settings.muted && window.speechSynthesis) speechSynthesis.cancel();
  $('btn-mute').textContent = settings.muted ? '🔇' : '🔊';
}

/* ---------------- 버튼 연결 ---------------- */
document.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.mode)));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => hideOverlay(b.dataset.close)));
$('btn-open-howto').addEventListener('click', () => showOverlay('howto-ui'));
$('btn-open-settings').addEventListener('click', openSettings);
$('btn-settings').addEventListener('click', openSettings);
$('btn-pause-settings').addEventListener('click', openSettings);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', showLobby);
$('btn-home').addEventListener('click', () => {
  if (G.state === 'PLAYING' || G.state === 'CLEARING') togglePause();
  else if (G.state !== 'PAUSED' && G.state !== 'QUIZ') showLobby();
});
$('next-level-btn').addEventListener('click', nextLevel);
$('retry-btn').addEventListener('click', () => startGame(G.mode));
$('restart-btn').addEventListener('click', showLobby);
$('quiz-listen').addEventListener('click', () => G.quiz && TTS.speak(G.quiz.q.cn));
$('intro-ui').addEventListener('click', closeIntro);
document.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', () => S.ui()));

/* ---------------- 화면 맞춤 · 브라우저 안내 ---------------- */
function isChrome() {
  const brands = navigator.userAgentData && navigator.userAgentData.brands;
  if (brands) return brands.some((b) => b.brand === 'Google Chrome');
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edg\/|OPR\/|Whale\/|SamsungBrowser/.test(ua);
}
function fit() {
  const banner = $('browser-banner').classList.contains('hidden') ? 0 : 40;
  const s = Math.min(window.innerWidth / 960, (window.innerHeight - banner) / 930);
  $('stage').style.setProperty('--scale', Math.max(0.4, s).toFixed(3));
}
if (!isChrome()) $('browser-banner').classList.remove('hidden');
$('banner-close').addEventListener('click', () => {
  $('browser-banner').classList.add('hidden');
  fit();
});
window.addEventListener('resize', fit);
fit();
$('btn-mute').textContent = settings.muted ? '🔇' : '🔊';
requestAnimationFrame(loop);
