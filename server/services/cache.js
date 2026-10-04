let cachedPresentationState = null;
let cachedStudioSettings = null;
let cachedPromoSettings = null;
let adminPasswordHash = null;

async function initCache(sql, ensureInitialized) {
  try {
    if (ensureInitialized) {
      await ensureInitialized();
    }

    const pStateRes = await sql.query('SELECT * FROM presentation_state WHERE id = 1');
    if (pStateRes.length > 0) {
      cachedPresentationState = pStateRes[0];
      if (cachedPresentationState.current_question_id) {
        const qRes = await sql.query('SELECT * FROM questions WHERE id = $1', [cachedPresentationState.current_question_id]);
        cachedPresentationState.question = qRes[0] || null;
      } else {
        cachedPresentationState.question = null;
      }
    }

    const studioRes = await sql.query('SELECT * FROM studio_settings WHERE id = 1');
    if (studioRes.length > 0) {
      cachedStudioSettings = studioRes[0];
    }

    const promoRes = await sql.query('SELECT * FROM promo_settings WHERE id = 1');
    if (promoRes.length > 0) {
      cachedPromoSettings = promoRes[0];
    }

    const adminRes = await sql.query('SELECT admin_password FROM admin_settings WHERE id = 1');
    if (adminRes.length > 0) {
      adminPasswordHash = adminRes[0].admin_password;
    }
  } catch (err) {
    console.error('Failed to initialize cache / database:', err);
  }
}

function getPresentationState() {
  return cachedPresentationState;
}

function setPresentationState(state) {
  cachedPresentationState = state;
}

function getStudioSettings() {
  return cachedStudioSettings;
}

function setStudioSettings(settings) {
  cachedStudioSettings = settings;
}

function getPromoSettings() {
  return cachedPromoSettings;
}

function setPromoSettings(settings) {
  cachedPromoSettings = settings;
}

function getAdminPasswordHash() {
  return adminPasswordHash;
}

function setAdminPasswordHash(hash) {
  adminPasswordHash = hash;
}

module.exports = {
  initCache,
  getPresentationState,
  setPresentationState,
  getStudioSettings,
  setStudioSettings,
  getPromoSettings,
  setPromoSettings,
  getAdminPasswordHash,
  setAdminPasswordHash
};
