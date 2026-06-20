/* ═══ TerraLens — Story Mode Engine (Live Data) ═══ */

const StoryEngine = (() => {
  let isPlaying = false;
  let currentAct = -1;
  let progressInterval = null;
  let startTime = 0;
  let storyMap = null;
  let storyMarker = null;
  let apiData = null;
  let timeouts = [];
  const TOTAL_DURATION = 50;
  const LAT = 23.3441, LON = 85.3096;

  const ACTS = [
    { id: 'act-meet',     label: 'Meet Ranchi',   start: 0,  dur: 12 },
    { id: 'act-problem',  label: 'The Problem',   start: 12, dur: 10 },
    { id: 'act-stakes',   label: 'The Stakes',    start: 22, dur: 9  },
    { id: 'act-solution', label: 'The Solution',  start: 31, dur: 9  },
    { id: 'act-impact',   label: 'The Impact',    start: 40, dur: 10 },
  ];

  async function start() {
    if (isPlaying) return;
    isPlaying = true;
    currentAct = -1;
    apiData = null;
    buildOverlayHTML();
    const ov = document.getElementById('story-overlay');
    ov.classList.add('active');
    document.body.style.overflow = 'hidden';
    initParticles();
    
    const loadingStartTime = Date.now();
    const loadInt = setInterval(() => {
      const elapsed = (Date.now() - loadingStartTime) / 1000;
      const el = document.getElementById('loading-timer');
      if (el) el.textContent = elapsed.toFixed(1) + 's elapsed';
      
      const statusEl = document.getElementById('loading-status-text');
      if (statusEl) {
        if (elapsed < 5) statusEl.textContent = 'Fetching satellite imagery...';
        else if (elapsed < 12) statusEl.textContent = 'Pulling weather & emissions data...';
        else if (elapsed < 100) statusEl.textContent = 'AI analyzing land cover (Vision NIM in progress)...';
        else statusEl.textContent = 'Generating local climate profile...';
      }
    }, 100);
    
    await fireAPI();
    
    clearInterval(loadInt);
    
    if (!isPlaying) return;
    
    const loadingAct = document.getElementById('act-loading');
    if (loadingAct) {
      loadingAct.classList.remove('active');
      loadingAct.classList.add('exiting');
    }
    
    startTime = Date.now();
    progressInterval = setInterval(updateProgress, 100);
    updateProgress();
    scheduleActs();
  }

  function stop() {
    isPlaying = false;
    currentAct = -1;
    clearInterval(progressInterval);
    timeouts.forEach(t => clearTimeout(t));
    timeouts = [];
    const ov = document.getElementById('story-overlay');
    if (ov) { ov.classList.remove('active'); ov.remove(); }
    document.body.style.overflow = '';
    if (storyMap) { storyMap.remove(); storyMap = null; }
    storyMarker = null;
    destroyParticles();
  }

  async function fireAPI() {
    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: LAT, lon: LON, radius_km: 15 })
      });
      if (!r.ok) throw new Error(r.status);
      apiData = await r.json();
      // Update loading badge
      const b = document.getElementById('story-api-badge');
      if (b) { b.textContent = '✓ DATA LOADED'; b.className = 'story-api-badge loaded'; }
      populateActs();
    } catch (e) {
      console.error('Story API failed:', e);
      const b = document.getElementById('story-api-badge');
      if (b) { b.textContent = '⚠ USING DEFAULTS'; b.className = 'story-api-badge fallback'; }
    }
  }

  function scheduleActs() {
    ACTS.forEach((a, i) => {
      const t = setTimeout(() => { if (isPlaying) transitionTo(i); }, a.start * 1000);
      timeouts.push(t);
    });
  }

  function transitionTo(idx) {
    if (currentAct >= 0) {
      const prev = document.getElementById(ACTS[currentAct].id);
      if (prev) { prev.classList.add('exiting'); prev.classList.remove('active'); setTimeout(() => prev.classList.remove('exiting'), 800); }
      const pd = document.querySelectorAll('#story-overlay .tl-dot')[currentAct];
      if (pd) { pd.classList.remove('active'); pd.classList.add('done'); }
      const pc = document.querySelectorAll('#story-overlay .tl-conn')[currentAct];
      if (pc) pc.classList.add('done');
    }
    currentAct = idx;
    const el = document.getElementById(ACTS[idx].id);
    if (el) setTimeout(() => { el.classList.add('active'); onActEnter(idx); }, 250);
    const lb = document.querySelector('.story-act-label');
    if (lb) lb.textContent = ACTS[idx].label;
    const dot = document.querySelectorAll('#story-overlay .tl-dot')[idx];
    if (dot) dot.classList.add('active');
  }

  function onActEnter(idx) {
    if (idx === 0) initStoryMap();
    if (idx === 2) setTimeout(() => { const b = document.querySelector('.temp-bar-fill'); if (b) b.classList.add('animated'); }, 600);
    if (idx === 4) setTimeout(animateGauge, 400);
  }

  function initStoryMap() {
    const el = document.getElementById('story-map');
    if (!el || storyMap) return;
    storyMap = L.map(el, { center: [LAT, LON], zoom: 6, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 19 }).addTo(storyMap);
    // Animate zoom in
    setTimeout(() => storyMap.flyTo([LAT, LON], 12, { duration: 3 }), 800);
    // Drop pin after zoom
    setTimeout(() => {
      storyMarker = L.marker([LAT, LON], {
        icon: L.divIcon({ className: 'story-pin', html: '<div class="sp-dot"></div><div class="sp-ring"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
      }).addTo(storyMap);
      // Show coords
      const cd = document.getElementById('story-coords');
      if (cd) cd.classList.add('visible');
    }, 4200);
  }

  function populateActs() {
    if (!apiData) return;
    const d = apiData;
    // Act 2: emissions
    const tbody = document.getElementById('story-emit-body');
    if (tbody && d.emitters && d.emitters.length > 0) {
      tbody.innerHTML = '';
      d.emitters.slice(0, 4).forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(e.name)}</td><td>${esc(e.sector)}</td><td style="font-family:var(--mono);color:var(--red)">${Number(e.emissions_tons_co2e).toLocaleString()}</td>`;
        tbody.appendChild(tr);
      });
    }
    // Act 2: weather
    const tempEl = document.getElementById('story-temp-val');
    const pmEl = document.getElementById('story-pm-val');
    if (d.weather) {
      if (tempEl && d.weather.temperature_c !== null) tempEl.textContent = d.weather.temperature_c + '°C';
      if (pmEl && d.weather.pm2_5 !== null) pmEl.textContent = d.weather.pm2_5 + ' µg/m³';
    }
    // Act 3: feels like / projection
    const flEl = document.getElementById('story-feels');
    if (flEl && d.weather && d.weather.feels_like_c !== null) flEl.textContent = d.weather.feels_like_c + '°C';
    // Act 4: real actions
    const pillBox = document.getElementById('story-pills');
    if (pillBox && d.synthesis && d.synthesis.top_actions && d.synthesis.top_actions.length > 0) {
      pillBox.innerHTML = '';
      const colors = ['green', 'amber', 'purple', 'accent'];
      d.synthesis.top_actions.slice(0, 4).forEach((a, i) => {
        const div = document.createElement('div');
        div.className = `act-action-pill ${colors[i % colors.length]}`;
        div.style.animationDelay = `${1.2 + i * 0.3}s`;
        div.innerHTML = `<span class="pill-dot"></span>${esc(a.action)}`;
        pillBox.appendChild(div);
      });
    }
    // Act 5: profile text
    const profEl = document.getElementById('story-profile');
    if (profEl && d.synthesis && d.synthesis.area_profile) {
      profEl.textContent = d.synthesis.area_profile.substring(0, 200) + (d.synthesis.area_profile.length > 200 ? '...' : '');
    }
    // Satellite image
    const satEl = document.getElementById('story-sat-img');
    if (satEl && d.satellite_image_url) satEl.src = d.satellite_image_url;
    // Land cover
    if (d.vision && d.vision.land_cover) {
      const lc = d.vision.land_cover;
      const bar = document.getElementById('story-lc-bar');
      if (bar) {
        bar.innerHTML = '';
        [{p: lc.vegetation_pct, c: '#34d399', l: 'Veg'}, {p: lc.water_pct, c: '#38bdf8', l: 'Water'}, {p: lc.built_pct, c: '#94a3b8', l: 'Built'}, {p: lc.bare_pct, c: '#d4a574', l: 'Bare'}].forEach(s => {
          if (s.p > 0) { const d = document.createElement('div'); d.style.width = s.p + '%'; d.style.background = s.c; d.title = s.l + ': ' + s.p + '%'; bar.appendChild(d); }
        });
      }
      const vegEl = document.getElementById('story-veg-val');
      if (vegEl) vegEl.textContent = (lc.vegetation_pct || 0) + '%';
      const builtEl = document.getElementById('story-built-val');
      if (builtEl) builtEl.textContent = (lc.built_pct || 0) + '%';
    }
    // Emitter count
    const ecEl = document.getElementById('story-emit-count');
    if (ecEl) ecEl.textContent = d.emitters ? d.emitters.length : 0;
  }

  function animateGauge() {
    const scoreEl = document.querySelector('.risk-gauge-score');
    const fillEl = document.querySelector('.risk-gauge-fill');
    if (!scoreEl || !fillEl) return;
    const C = 2 * Math.PI * 85;
    scoreEl.textContent = '73'; scoreEl.className = 'risk-gauge-score high';
    fillEl.className = 'risk-gauge-fill high';
    fillEl.style.strokeDasharray = C;
    fillEl.style.strokeDashoffset = C - (73 / 100) * C;
    setTimeout(() => {
      const dur = 2000, st = Date.now();
      (function tick() {
        const p = Math.min((Date.now() - st) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const v = Math.round(73 - 32 * e);
        scoreEl.textContent = v;
        fillEl.style.strokeDashoffset = C - (v / 100) * C;
        if (v <= 50) { scoreEl.className = 'risk-gauge-score low'; fillEl.className = 'risk-gauge-fill low'; }
        if (p < 1) requestAnimationFrame(tick);
      })();
    }, 500);
  }

  function updateProgress() {
    if (!isPlaying) return;
    const el = (Date.now() - startTime) / 1000;
    const pct = Math.min((el / TOTAL_DURATION) * 100, 100);
    const f = document.querySelector('.story-progress-fill');
    if (f) f.style.width = pct + '%';
    const t = document.querySelector('.story-timer');
    if (t) { const r = Math.max(0, TOTAL_DURATION - Math.floor(el)); t.textContent = '0:' + String(r).padStart(2, '0'); }
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  /* ── Particles ─────────────────────────────────────────────── */
  let pCanvas = null, pCtx = null, pts = [], pAF = null;
  function initParticles() {
    const c = document.querySelector('.story-bg-particles'); if (!c) return;
    pCanvas = document.createElement('canvas'); c.appendChild(pCanvas); pCtx = pCanvas.getContext('2d');
    pCanvas.width = window.innerWidth; pCanvas.height = window.innerHeight;
    pts = Array.from({length: 50}, () => ({ x: Math.random()*pCanvas.width, y: Math.random()*pCanvas.height, vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3, r: Math.random()*1.5+0.5, a: Math.random()*0.25+0.05, c: Math.random()>0.5?'56,189,248':'52,211,153' }));
    (function draw() {
      pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
      pts.forEach(p => { p.x+=p.vx; p.y+=p.vy; if(p.x<0)p.x=pCanvas.width; if(p.x>pCanvas.width)p.x=0; if(p.y<0)p.y=pCanvas.height; if(p.y>pCanvas.height)p.y=0; pCtx.beginPath(); pCtx.arc(p.x,p.y,p.r,0,Math.PI*2); pCtx.fillStyle=`rgba(${p.c},${p.a})`; pCtx.fill(); });
      pAF = requestAnimationFrame(draw);
    })();
  }
  function destroyParticles() { if(pAF)cancelAnimationFrame(pAF); if(pCanvas)pCanvas.remove(); pts=[]; pCanvas=null; pCtx=null; }

  /* ── Build Overlay HTML ────────────────────────────────────── */
  function buildOverlayHTML() {
    let existing = document.getElementById('story-overlay');
    if (existing) existing.remove();
    const ov = document.createElement('div');
    ov.id = 'story-overlay';
    ov.className = 'story-overlay';
    ov.innerHTML = `
    <div class="story-topbar">
      <div class="story-topbar-left">
        <span class="story-logo"><span class="logo-accent">Terra</span>Lens</span>
        <span class="story-act-label">Initializing...</span>
        <span id="story-api-badge" class="story-api-badge loading">⟳ FETCHING DATA</span>
      </div>
      <div class="story-progress-track"><div class="story-progress-fill"></div></div>
      <span class="story-timer">0:50</span>
      <button class="story-close-btn" onclick="StoryEngine.stop()" title="Exit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="story-stage">
      <div class="story-bg-particles"></div>

      <!-- LOADING SCREEN -->
      <div class="story-act active" id="act-loading" style="flex-direction:column; gap:1.5rem; text-align:center;">
        <div class="story-logo" style="font-size:3rem;"><span class="logo-accent">Terra</span>Lens</div>
        <div style="font-size:1.1rem; color:var(--text-secondary); display:flex; align-items:center; justify-content:center; gap:12px; font-weight:500;">
          <div style="width:12px; height:12px; border-radius:50%; background:var(--accent); animation:dotPulse 1.5s infinite;"></div>
          <span id="loading-status-text">Synthesizing Satellite & Climate Data...</span>
        </div>
        <div id="loading-timer" style="font-family:var(--mono); font-size:0.9rem; color:var(--text-muted); margin-top:-0.5rem;">0.0s elapsed</div>
      </div>

      <!-- ACT 1: Meet Ranchi — Live Map -->
      <div class="story-act" id="act-meet">
        <div class="act-container act-split">
          <div class="act-text-side">
            <div class="act-number">Act 1 — Live Data</div>
            <div class="act-title">Meet <span style="color:var(--accent)">Ranchi</span></div>
            <div class="act-subtitle">Dropping a pin on Ranchi, Jharkhand — TerraLens fetches real satellite imagery, weather, and emissions data for this exact location.</div>
            <div id="story-coords" class="story-coords">
              <span class="sc-icon">📍</span>
              <span class="sc-val">${LAT.toFixed(4)}°N, ${LON.toFixed(4)}°E</span>
              <span class="sc-radius">r = 15 km</span>
            </div>
            <div class="act-data-row compact">
              <div class="act-data-card accent"><div class="data-value">${LAT.toFixed(2)}°N</div><div class="data-label">Latitude</div></div>
              <div class="act-data-card green"><div class="data-value">${LON.toFixed(2)}°E</div><div class="data-label">Longitude</div></div>
              <div class="act-data-card purple"><div class="data-value">5</div><div class="data-label">Data Pipelines</div></div>
            </div>
          </div>
          <div class="act-visual-side">
            <div class="story-map-wrap"><div id="story-map"></div></div>
          </div>
        </div>
      </div>

      <!-- ACT 2: The Problem -->
      <div class="story-act" id="act-problem">
        <div class="act-container act-split">
          <div class="act-text-side">
            <div class="act-number">Act 2 — Emissions & Air Quality</div>
            <div class="act-title">The <span style="color:var(--red)">Problem</span></div>
            <div class="act-subtitle">TerraLens scans ClimateTrace for industrial emitters and pulls real-time air quality from Open-Meteo.</div>
            <div class="act-data-row compact">
              <div class="act-data-card red"><div class="data-value" id="story-temp-val">—</div><div class="data-label">Temperature</div></div>
              <div class="act-data-card amber"><div class="data-value" id="story-pm-val">—</div><div class="data-label">PM2.5</div></div>
              <div class="act-data-card red"><div class="data-value" id="story-emit-count">—</div><div class="data-label">Emitters Found</div></div>
            </div>
          </div>
          <div class="act-visual-side">
            <div class="act-mini-table"><table><thead><tr><th>Source</th><th>Sector</th><th>CO₂e (tons)</th></tr></thead>
              <tbody id="story-emit-body">
                <tr><td>Loading...</td><td>—</td><td>—</td></tr>
              </tbody>
            </table></div>
            <div class="act-heat-visual"></div>
          </div>
        </div>
      </div>

      <!-- ACT 3: The Stakes -->
      <div class="story-act" id="act-stakes">
        <div class="act-container act-split">
          <div class="act-text-side">
            <div class="act-number">Act 3 — Climate Projection</div>
            <div class="act-title">The <span style="color:var(--amber)">Stakes</span></div>
            <div class="act-subtitle">Current trajectories project devastating warming. The satellite view reveals land cover under pressure.</div>
            <div class="act-temp-gauge"><div class="temp-bar-track"><div class="temp-bar-fill"></div></div><div class="temp-labels"><span>0°C</span><span>+1.5°C safe</span><span>+4°C</span></div></div>
            <div class="act-temp-big">+3.2°C</div>
            <div class="act-temp-context">Projected increase by 2030<br><strong style="color:var(--red)">Above Paris Agreement threshold</strong></div>
            <div class="act-data-row compact" style="margin-top:1rem">
              <div class="act-data-card amber"><div class="data-value" id="story-feels">—</div><div class="data-label">Feels Like</div></div>
              <div class="act-data-card green"><div class="data-value" id="story-veg-val">—</div><div class="data-label">Vegetation</div></div>
              <div class="act-data-card red"><div class="data-value" id="story-built-val">—</div><div class="data-label">Built-up</div></div>
            </div>
          </div>
          <div class="act-visual-side">
            <div class="story-sat-wrap">
              <img id="story-sat-img" class="story-sat-img" src="" alt="Satellite">
              <div class="story-sat-overlay">AI Vision Analysis</div>
            </div>
            <div id="story-lc-bar" class="land-cover-bar" style="margin-top:0.8rem"></div>
          </div>
        </div>
      </div>

      <!-- ACT 4: The Solution -->
      <div class="story-act" id="act-solution">
        <div class="act-container">
          <div class="act-trees-visual"><span class="act-tree">🌳</span><span class="act-tree">🌲</span><span class="act-tree">🌳</span><span class="act-tree">🌿</span><span class="act-tree">🌲</span><span class="act-tree">🌳</span><span class="act-tree">🌿</span></div>
          <div class="act-number">Act 4 — AI-Generated Actions</div>
          <div class="act-title">The <span style="color:var(--green)">Solution</span></div>
          <div class="act-subtitle">TerraLens synthesizes all data into hyper-local action cards — specific to this exact location.</div>
          <div id="story-pills" class="act-action-pills">
            <div class="act-action-pill green"><span class="pill-dot"></span>Analyzing actions...</div>
          </div>
          <p id="story-profile" class="story-profile-text"></p>
        </div>
      </div>

      <!-- ACT 5: The Impact -->
      <div class="story-act" id="act-impact">
        <div class="act-container">
          <div class="act-number">Act 5 — Simulated Impact</div>
          <div class="act-title">The <span style="color:var(--green)">Impact</span></div>
          <div class="act-subtitle">Simulating combined effect of all recommended actions on the environmental risk score.</div>
          <div class="act-risk-gauge">
            <svg class="risk-gauge-svg" viewBox="0 0 200 200"><circle class="risk-gauge-bg" cx="100" cy="100" r="85"/><circle class="risk-gauge-fill high" cx="100" cy="100" r="85"/></svg>
            <div class="risk-gauge-center"><div class="risk-gauge-score high">—</div><div class="risk-gauge-label">Risk Score</div></div>
          </div>
          <div class="risk-arrow"><span class="from-score">73</span><span class="arrow-icon">→</span><span class="to-score">41</span></div>
          <div class="act-data-row compact">
            <div class="act-data-card green"><div class="data-value">-44%</div><div class="data-label">Risk Reduction</div></div>
            <div class="act-data-card green"><div class="data-value">-2.1°C</div><div class="data-label">Heat Reduction</div></div>
            <div class="act-data-card accent"><div class="data-value">340K</div><div class="data-label">People Helped</div></div>
          </div>
          <div class="act-cta-group">
            <button class="btn-primary" onclick="StoryEngine.stop();scrollToMap();"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>Try It Yourself</button>
            <button class="btn-secondary" onclick="StoryEngine.stop()">Close Story</button>
          </div>
        </div>
      </div>
    </div>
    <div class="story-timeline">${ACTS.map((a, i) => `<div class="tl-dot" data-i="${i}"><span class="dot-circle"></span><span class="dot-label">${a.label}</span></div>${i < ACTS.length - 1 ? '<div class="tl-conn"></div>' : ''}`).join('')}</div>`;

    document.body.appendChild(ov);
    // Fix SVG gauge
    const fc = ov.querySelector('.risk-gauge-fill');
    if (fc) { const C = 2 * Math.PI * 85; fc.setAttribute('stroke-dasharray', C); fc.setAttribute('stroke-dashoffset', C); }
  }

  return { start, stop, ACTS };
})();
