/* ═══ TerraLens — Frontend Logic ═══
   Stage A: Location capture (pin-drop / geolocation)
   + Dashboard rendering for Stages B-E results
*/

// ── State ──────────────────────────────────────────────────────────
let selectedLat = null;
let selectedLon = null;
let map = null;
let marker = null;
let radiusCircle = null;
let lastAnalysisData = null;

// ── Init ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  document.getElementById('radius-slider').addEventListener('input', (e) => {
    document.getElementById('radius-value').textContent = e.target.value;
    if (selectedLat && radiusCircle) {
      radiusCircle.setRadius(parseInt(e.target.value) * 1000);
    }
  });
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchLocation();
  });

  // Add zoom to satellite image
  const satImg = document.getElementById('satellite-img');
  if (satImg) {
    let scale = 1;
    satImg.parentElement.style.overflow = 'hidden';
    satImg.style.cursor = 'zoom-in';
    satImg.style.transformOrigin = 'center center';
    
    satImg.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale += e.deltaY * -0.005;
      scale = Math.min(Math.max(1, scale), 5);
      satImg.style.transform = `scale(${scale})`;
    });

    satImg.addEventListener('dblclick', () => {
      scale = 1;
      satImg.style.transform = `scale(${scale})`;
    });
  }
});

function initMap() {
  map = L.map('map', {
    center: [23.3216, 85.3080], // Default: Hatia, Ranchi
    zoom: 10,
    zoomControl: true,
  });

  // Google Satellite tile layer
  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google Maps',
    maxZoom: 19,
  }).addTo(map);

  // Click to drop pin
  map.on('click', (e) => {
    setPin(e.latlng.lat, e.latlng.lng);
  });
}

function setPin(lat, lon) {
  selectedLat = parseFloat(lat.toFixed(6));
  selectedLon = parseFloat(lon.toFixed(6));

  // Update or create marker
  if (marker) {
    marker.setLatLng([selectedLat, selectedLon]);
  } else {
    marker = L.marker([selectedLat, selectedLon], {
      icon: L.divIcon({
        className: 'custom-pin',
        html: `<div style="
          width:20px;height:20px;border-radius:50%;
          background:linear-gradient(135deg,#38bdf8,#06b6d4);
          border:3px solid #f0f4f8;
          box-shadow:0 0 16px rgba(56,189,248,0.6);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map);
  }

  // Radius circle
  const radiusKm = parseInt(document.getElementById('radius-slider').value);
  if (radiusCircle) {
    radiusCircle.setLatLng([selectedLat, selectedLon]);
    radiusCircle.setRadius(radiusKm * 1000);
  } else {
    radiusCircle = L.circle([selectedLat, selectedLon], {
      radius: radiusKm * 1000,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.06,
      weight: 1,
      dashArray: '6 4',
    }).addTo(map);
  }

  // Update coordinate display
  document.getElementById('coord-lat').textContent = selectedLat;
  document.getElementById('coord-lon').textContent = selectedLon;
  document.getElementById('coord-display').classList.remove('hidden');

  // Enable analyze button
  const btn = document.getElementById('btn-analyze');
  btn.disabled = false;
  btn.classList.remove('disabled');
}

// ── Search ─────────────────────────────────────────────────────────
async function searchLocation() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { 'User-Agent': 'TerraLens/1.0 (educational)' } }
    );
    const results = await resp.json();
    if (results.length > 0) {
      const { lat, lon, display_name } = results[0];
      map.setView([parseFloat(lat), parseFloat(lon)], 12);
      setPin(parseFloat(lat), parseFloat(lon));
      document.getElementById('search-input').value = display_name.split(',').slice(0, 2).join(',');
    }
  } catch (err) {
    console.error('Search failed:', err);
  }
}

// ── Geolocation ────────────────────────────────────────────────────
function geolocateUser() {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 13);
      setPin(latitude, longitude);
    },
    (err) => alert(`Location access denied: ${err.message}`),
    { enableHighAccuracy: false, timeout: 8000 }
  );
}

// ── Scroll helper ──────────────────────────────────────────────────
function scrollToMap() {
  document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Analysis pipeline call ─────────────────────────────────────────
async function runAnalysis() {
  if (selectedLat === null || selectedLon === null) return;
  document.getElementById('time-warning-modal').classList.remove('hidden');
}

function cancelAnalysis() {
  document.getElementById('time-warning-modal').classList.add('hidden');
}

async function confirmAnalysis() {
  document.getElementById('time-warning-modal').classList.add('hidden');
  const radiusKm = parseInt(document.getElementById('radius-slider').value);

  // Show loading, hide dashboard
  document.getElementById('map-section').classList.add('hidden');
  document.getElementById('loading-section').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');

  const loadingStartTime = Date.now();
  const timerEl = document.getElementById('pin-loading-timer');
  const loadInt = setInterval(() => {
    if (timerEl) timerEl.textContent = ((Date.now() - loadingStartTime) / 1000).toFixed(1) + 's elapsed';
  }, 100);

  // Animate loading steps
  animateSteps();

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: selectedLat, lon: selectedLon, radius_km: radiusKm }),
    });

    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const data = await resp.json();
    lastAnalysisData = data;
    clearInterval(loadInt);
    renderDashboard(data);
  } catch (err) {
    clearInterval(loadInt);
    console.error('Analysis failed:', err);
    alert(`Analysis failed: ${err.message}. Check that the backend is running.`);
    // Show map section again
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('map-section').classList.remove('hidden');
  }
}

function promptStory() {
  document.getElementById('story-warning-modal').classList.remove('hidden');
}

function cancelStory() {
  document.getElementById('story-warning-modal').classList.add('hidden');
}

function confirmStory() {
  document.getElementById('story-warning-modal').classList.add('hidden');
  StoryEngine.start();
}

function animateSteps() {
  const steps = ['step-tiles', 'step-data', 'step-vision', 'step-synth'];
  // Timings aligned with real backend logs (~1.5 to 2 mins)
  const delays = [0, 5000, 8000, 92000];
  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    const dot = el.querySelector('.step-dot');
    setTimeout(() => {
      el.classList.add('active');
      dot.classList.add('active');
      // Mark previous as done
      if (i > 0) {
        const prev = document.getElementById(steps[i - 1]);
        prev.classList.remove('active');
        prev.classList.add('done');
        prev.querySelector('.step-dot').classList.remove('active');
        prev.querySelector('.step-dot').classList.add('done');
      }
    }, delays[i]);
  });
}

// ── Dashboard renderer ─────────────────────────────────────────────
function renderDashboard(data) {
  document.getElementById('loading-section').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Header
  document.getElementById('dashboard-location').textContent =
    `📍 ${data.location_label || `${data.lat}, ${data.lon}`}`;

  const ts = data.data_retrieved_at ? new Date(data.data_retrieved_at).toLocaleString() : '—';
  document.getElementById('dashboard-timestamp').querySelector('span').textContent = ts;

  const conf = data.synthesis?.confidence || data.vision?.confidence || '—';
  const confTag = document.getElementById('dashboard-confidence');
  confTag.querySelector('span').textContent = `Confidence: ${conf}`;
  confTag.dataset.level = conf;

  // Satellite image
  if (data.satellite_image_url) {
    document.getElementById('satellite-img').src = data.satellite_image_url;
  }

  // Vision quality badge
  const vq = data.vision?.image_quality || '—';
  const vqBadge = document.getElementById('vision-quality');
  vqBadge.textContent = vq.replace('_', ' ');

  // Land cover bar
  const lcBar = document.getElementById('land-cover-bar');
  lcBar.innerHTML = '';
  if (data.vision?.land_cover) {
    const lc = data.vision.land_cover;
    const segments = [
      { pct: lc.vegetation_pct, color: '#34d399', label: 'Vegetation' },
      { pct: lc.water_pct, color: '#38bdf8', label: 'Water' },
      { pct: lc.built_pct, color: '#94a3b8', label: 'Built' },
      { pct: lc.bare_pct, color: '#d4a574', label: 'Bare' },
    ];
    segments.forEach(s => {
      if (s.pct > 0) {
        const div = document.createElement('div');
        div.style.width = `${s.pct}%`;
        div.style.background = s.color;
        div.title = `${s.label}: ${s.pct}%`;
        lcBar.appendChild(div);
      }
    });
  }

  // Weather
  renderWeather(data.weather);

  // Notable features and Landmarks
  const nfContainer = document.getElementById('notable-features');
  nfContainer.innerHTML = '';
  const combinedFeatures = data.vision?.landmarks || [];
  combinedFeatures.forEach(f => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = f;
    nfContainer.appendChild(tag);
  });

  // Area profile
  document.getElementById('profile-text').textContent =
    data.synthesis?.area_profile || 'No profile available.';

  // Emitter table
  renderEmitters(data.emitters || []);

  // Action cards
  renderActions(data.synthesis?.top_actions || []);

  // Responsible AI notes
  document.getElementById('responsible-text').textContent =
    data.synthesis?.responsible_ai_notes || 'No notes available.';

  // Errors
  const errorsList = data.errors || [];
  const errorsBanner = document.getElementById('errors-banner');
  if (errorsList.length > 0) {
    errorsBanner.classList.remove('hidden');
    const ul = document.getElementById('errors-list');
    ul.innerHTML = '';
    errorsList.forEach(e => {
      const li = document.createElement('li');
      li.textContent = e;
      ul.appendChild(li);
    });
  } else {
    errorsBanner.classList.add('hidden');
  }

  // Scroll to dashboard
  setTimeout(() => {
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
  }, 200);
}

function renderWeather(weather) {
  const grid = document.getElementById('weather-grid');
  grid.innerHTML = '';
  if (!weather) {
    grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center">Weather data unavailable</p>';
    return;
  }

  const tiles = [
    { icon: '🌡️', value: weather.temperature_c !== null ? `${weather.temperature_c}°C` : '—', label: 'Temperature' },
    { icon: '🤒', value: weather.feels_like_c !== null ? `${weather.feels_like_c}°C` : '—', label: 'Feels Like', cls: weather.feels_like_c > 40 ? 'danger' : '' },
    { icon: '💨', value: weather.wind_speed_kmh !== null ? `${weather.wind_speed_kmh} km/h` : '—', label: 'Wind Speed' },
    { icon: '🧭', value: weather.wind_direction_deg !== null ? `${weather.wind_direction_deg}°` : '—', label: 'Wind Dir' },
    { icon: '🫁', value: weather.pm2_5 !== null ? `${weather.pm2_5} µg/m³` : '—', label: 'PM2.5', cls: weather.pm2_5 > 15 ? 'danger' : weather.pm2_5 > 10 ? 'warning' : '' },
    { icon: '🌫️', value: weather.pm10 !== null ? `${weather.pm10} µg/m³` : '—', label: 'PM10', cls: weather.pm10 > 45 ? 'danger' : weather.pm10 > 30 ? 'warning' : '' },
  ];

  tiles.forEach(t => {
    const div = document.createElement('div');
    div.className = `weather-tile ${t.cls || ''}`;
    div.innerHTML = `
      <div class="wt-icon">${t.icon}</div>
      <div class="wt-value">${t.value}</div>
      <div class="wt-label">${t.label}</div>
    `;
    grid.appendChild(div);
  });
}

function renderEmitters(emitters) {
  const tbody = document.getElementById('emitter-tbody');
  const noData = document.getElementById('no-emitters');
  const countBadge = document.getElementById('emitter-count');

  tbody.innerHTML = '';
  countBadge.textContent = `${emitters.length} source${emitters.length !== 1 ? 's' : ''}`;

  if (emitters.length === 0) {
    noData.classList.remove('hidden');
    return;
  }
  noData.classList.add('hidden');

  // Filter out 0 emissions and take top 50 to prevent DOM lag
  const validEmitters = emitters
    .filter(e => Number(e.emissions_tons_co2e) > 0)
    .sort((a, b) => Number(b.emissions_tons_co2e) - Number(a.emissions_tons_co2e))
    .slice(0, 50);

  validEmitters.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.sector)}</td>
      <td>${e.distance_km} km</td>
      <td>${Number(e.emissions_tons_co2e).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
  
  if (validEmitters.length < emitters.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" style="text-align:center; color:var(--text-muted); font-style:italic;">Showing top ${validEmitters.length} out of ${emitters.length} sources (others are negligible)</td>`;
    tbody.appendChild(tr);
  }
}

function renderActions(actions) {
  const grid = document.getElementById('actions-grid');
  grid.innerHTML = '';

  if (actions.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted)">No actions generated.</p>';
    return;
  }

  // Sort actions from High to Low effort
  const effortScore = { 'high': 3, 'medium': 2, 'low': 1 };
  actions.sort((a, b) => {
    const scoreA = effortScore[(a.effort || '').toLowerCase()] || 0;
    const scoreB = effortScore[(b.effort || '').toLowerCase()] || 0;
    return scoreB - scoreA;
  });

  actions.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = `action-card effort-${a.effort}`;
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    
    card.innerHTML = `
      <div class="ac-number">Action ${i + 1}</div>
      <div class="ac-title">${escapeHtml(a.action)}</div>
      <div class="ac-reason">${escapeHtml(a.why_local)}</div>
      <span class="ac-effort">${a.effort} effort</span>
    `;
    grid.appendChild(card);

    // Stream card by card
    setTimeout(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    }, i * 500); // 500ms delay per card
  });
}

// ── Reset ──────────────────────────────────────────────────────────
function resetApp() {
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('map-section').classList.remove('hidden');
  document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
  // Reset loading step states
  ['step-tiles', 'step-data', 'step-vision', 'step-synth'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    el.querySelector('.step-dot').classList.remove('active', 'done');
  });
  // Re-invalidate the map size since the container was hidden
  setTimeout(() => { if (map) map.invalidateSize(); }, 300);
}

// ── Utility ────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function exportData() {
  if (!lastAnalysisData) {
    alert("No data available to export. Please run an analysis first.");
    return;
  }
  
  const dataStr = JSON.stringify(lastAnalysisData, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  
  // Format filename: terralens_export_lat_lon_timestamp.json
  const safeLat = lastAnalysisData.lat.toString().replace('.', '_');
  const safeLon = lastAnalysisData.lon.toString().replace('.', '_');
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `terralens_export_${safeLat}_${safeLon}_${dateStr}.json`;
  
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
