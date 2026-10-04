import re
import sqlite3

# 1. Update SQLite database presentation_state to active_screen = 'promo'
try:
    conn = sqlite3.connect('database.sqlite')
    c = conn.cursor()
    c.execute("UPDATE presentation_state SET active_screen = 'promo' WHERE id = 1")
    conn.commit()
    conn.close()
    print("Database updated: active_screen set to 'promo'")
except Exception as e:
    print(f"Database update note: {e}")

# Also update via local server API if running
import urllib.request, json
try:
    req = urllib.request.Request(
        'http://localhost:3000/api/presentation/state',
        data=json.dumps({'active_screen': 'promo'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    # If PUT or POST
    with urllib.request.urlopen(req) as resp:
        print("API updated active_screen to promo")
except Exception as e:
    pass

# 2. Update index.html button IDs to match script.js
with open('index.html', 'r', encoding='utf-8') as f:
    idx = f.read()

# Replace footer dock buttons with consistent IDs
old_dock_row = r'<div class="promo-controls-row">[\s\S]*?</div>\s*<div class="promo-hint-row">'
new_dock_row = """<div class="promo-controls-row">
          <div class="promo-track-dots">
            <button class="reel-dot-btn active" data-scene="1" title="Slide 1: Intro"><i class="fa-solid fa-circle"></i></button>
            <button class="reel-dot-btn" data-scene="2" title="Slide 2: Classes 1-10"><i class="fa-solid fa-circle"></i></button>
            <button class="reel-dot-btn" data-scene="3" title="Slide 3: One Participant"><i class="fa-solid fa-circle"></i></button>
            <button class="reel-dot-btn" data-scene="4" title="Slide 4: Conductors"><i class="fa-solid fa-circle"></i></button>
            <button class="reel-dot-btn" data-scene="5" title="Slide 5: Rewards"><i class="fa-solid fa-circle"></i></button>
          </div>
          <button class="action-btn-secondary action-btn-nav" id="btnPromoPrev" title="Previous Slide (Left Arrow)"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="action-btn-secondary action-btn-nav" id="btnPromoNext" title="Next Slide (Right Arrow)"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="action-btn-gold" id="promoPlayReelBtn" title="Toggle Auto-Reel (Space)">
            <i class="fa-solid fa-play"></i> <span id="promoPlayReelLabel">Play Reel</span>
          </button>
          <button class="action-btn-secondary" id="promoSoundBtn" title="Play Fanfare (F)">
            <i class="fa-solid fa-volume-high"></i> Fanfare
          </button>
          <button class="action-btn-accent" id="promoConfettiBtn" title="Celebrate (C)">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Celebrate
          </button>
          <button class="action-btn-primary" id="promoStartQuizBtn" title="Enter Quiz (Q)">
            <i class="fa-solid fa-bolt"></i> Enter Quiz
          </button>
          <button class="action-btn-secondary" id="promoDockHideBtn" title="Hide Dock (Press H)">
            <i class="fa-solid fa-eye-slash"></i>
          </button>
        </div>
        <div class="promo-hint-row">"""

idx = re.sub(old_dock_row, new_dock_row, idx)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(idx)
print("Updated index.html button IDs")

# 3. Update script.js to support all button IDs, advance slide on click, and ensure robust handlers
with open('script.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Update element lookups
js = js.replace(
    "const promoPlayReelBtn = document.getElementById('promoPlayReelBtn');",
    "const promoPlayReelBtn = document.getElementById('promoPlayReelBtn') || document.getElementById('btnPlayPromoReel');"
)
js = js.replace(
    "const promoSoundBtn = document.getElementById('promoSoundBtn');",
    "const promoSoundBtn = document.getElementById('promoSoundBtn') || document.getElementById('btnFanfare');"
)
js = js.replace(
    "const promoConfettiBtn = document.getElementById('promoConfettiBtn');",
    "const promoConfettiBtn = document.getElementById('promoConfettiBtn') || document.getElementById('btnCelebrate');"
)
js = js.replace(
    "const promoStartQuizBtn = document.getElementById('promoStartQuizBtn');",
    "const promoStartQuizBtn = document.getElementById('promoStartQuizBtn') || document.getElementById('btnEnterQuizFromPromo');"
)

# In updatePromoReelUI: update both label IDs
old_ui_func = """function updatePromoReelUI(isRunning) {
  if (promoPlayReelLabel) {
    promoPlayReelLabel.textContent = isRunning ? 'Pause Reel' : 'Play Reel';
  }"""
new_ui_func = """function updatePromoReelUI(isRunning) {
  const lbl = document.getElementById('promoPlayReelLabel') || document.getElementById('playReelText');
  if (lbl) {
    lbl.textContent = isRunning ? 'Pause Reel' : 'Play Reel';
  }"""
if old_ui_func in js:
    js = js.replace(old_ui_func, new_ui_func)

# Wire up Next, Prev, Slide-Click, and Enter Quiz
click_handlers = """
// ── Promo Navigation Listeners ──
document.getElementById('btnPromoPrev')?.addEventListener('click', (e) => {
  e.stopPropagation();
  stopPromoReel();
  let idx = promoScenesList.indexOf(currentPromoScene || '1');
  idx = (idx - 1 + promoScenesList.length) % promoScenesList.length;
  triggerPromoScene(promoScenesList[idx], 'backward');
});

document.getElementById('btnPromoNext')?.addEventListener('click', (e) => {
  e.stopPropagation();
  stopPromoReel();
  let idx = promoScenesList.indexOf(currentPromoScene || '1');
  idx = (idx + 1) % promoScenesList.length;
  triggerPromoScene(promoScenesList[idx], 'forward');
});

// Click anywhere on slide card advances to next slide!
document.querySelectorAll('.promo-slide').forEach(slide => {
  slide.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select')) return;
    stopPromoReel();
    let idx = promoScenesList.indexOf(currentPromoScene || '1');
    idx = (idx + 1) % promoScenesList.length;
    triggerPromoScene(promoScenesList[idx], 'forward');
  });
});

// Enter Quiz button
document.getElementById('promoStartQuizBtn')?.addEventListener('click', () => {
  stopPromoReel();
  if (window.socket) window.socket.emit('state:update', { active_screen: 'quiz' });
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screenQuiz')?.classList.add('active');
  currentScreen = 'quiz';
});
"""

if "// Click anywhere on slide card advances" not in js:
    # Append after dot button listeners
    js = js.replace(
        "// Click card to highlight that card's scene",
        click_handlers + "\n// Click card to highlight that card's scene"
    )

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("Updated script.js handlers")

# 4. Update admin.html to make #subview-matrix active by default
with open('admin.html', 'r', encoding='utf-8') as f:
    adm = f.read()

adm = adm.replace(
    '<div id="subview-matrix" class="promo-subview-panel">',
    '<div id="subview-matrix" class="promo-subview-panel active">'
)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(adm)
print("Updated admin.html subview-matrix active class")

# 5. Fix cast.html 404 script
with open('cast.html', 'r', encoding='utf-8') as f:
    cast = f.read()

cast = cast.replace('<script src="/node_modules/canvas-confetti/dist/confetti.browser.min.js"></script>', '')

with open('cast.html', 'w', encoding='utf-8') as f:
    f.write(cast)
print("Removed broken canvas-confetti import from cast.html")
