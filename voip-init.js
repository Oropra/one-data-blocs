// ============================================================================
//  VOIP-INIT — module One Data (OD.define)  v1 (Lot C)
//  Procédure d'init Twilio (SDK + token + Device + stockage multi-contexte).
//  Migré : user via ctx.supabase.auth ; URL/clé via ctx.tenant (token + REST) ;
//  plus d'esehl ni de wwAuth. Auto-gate : sans token VOIP -> abandon propre
//  (remplace la condition « User VOIP ? »). Stockage cross-frame conservé.
// ============================================================================
OD.define('voip-init', {
  async mount(__anchor, ctx) {
// 0. SDK Twilio
if (!window.Twilio) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@twilio/voice-sdk@2.10.2/dist/twilio.min.js'
    script.onload = resolve
    script.onerror = (e) => { console.error('❌ Erreur chargement SDK:', e); reject(e) }
    document.head.appendChild(script)
  })
  console.log('✅ SDK Twilio chargé dynamiquement')
}

// 1. Skip si device déjà actif
const existingDevice = (globalThis.__ONE_DATA__?.device) || window.parent._twilioDevice
if (existingDevice?.state && existingDevice.state !== 'destroyed') {
  console.log('✅ Device déjà initialisé, skip'); return { success: true }
}

// 2. Utilisateur
const { data: { user } } = await ctx.supabase.auth.getUser()
const email = user?.email
const authUid = user?.id
console.log('👤 Email utilisateur:', email, '| Auth UID:', authUid)
if (!email) { console.error('❌ Pas d\'utilisateur connecté'); return { success: false } }

// 3. Token
const supabaseUrl = ctx.tenant.supabase_url
const supabaseAnonKey = ctx.tenant.supabase_anon_key
const response = await fetch(`${supabaseUrl}/functions/v1/voip-generate-token`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
  body: JSON.stringify({ email })
})
const data = await response.json()
if (!data?.token) { console.error('❌ Token error:', data); return { success: false } }
console.log('✅ Token récupéré pour:', data.identity)
if (!window.Twilio) { console.error('❌ SDK Twilio toujours non disponible'); return { success: false } }
await new Promise(r => setTimeout(r, 2000))

// 4. Device
const device = new window.Twilio.Device(data.token, {
  codecPreferences: ['opus', 'pcmu'], enableRingingState: true, debug: false
})

// 5. Registre global — stocker dans TOUS les contextes
const frontWin = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || null

if (!globalThis.__ONE_DATA__) globalThis.__ONE_DATA__ = {}
globalThis.__ONE_DATA__.device = device
globalThis.__ONE_DATA__.call = null
globalThis.__ONE_DATA__.timer = null

if (frontWin) {
  if (!frontWin.__ONE_DATA__) frontWin.__ONE_DATA__ = {}
  frontWin.__ONE_DATA__.device = device
  frontWin.__ONE_DATA__.call = null
}

try { window._twilioDevice = device } catch (e) { }
try { window.parent._twilioDevice = device } catch (e) { }
try { window.top._twilioDevice = device } catch (e) { }
try { window.parent.__ONE_DATA__ = window.parent.__ONE_DATA__ || {}; window.parent.__ONE_DATA__.device = device } catch (e) { }
try { window.parent._twilioCallDuration = 0 } catch (e) { }
try { window.parent._twilioHungUp = false } catch (e) { }

// 6. Helper UI
const UI = () =>
  (frontWin && frontWin.__VOIP_UI__) ||
  (wwLib.getFrontWindow && wwLib.getFrontWindow().__VOIP_UI__) ||
  window.__VOIP_UI__ ||
  (window.parent && window.parent.__VOIP_UI__) ||
  null

const cap = (s) => (s || '').toLowerCase()
  .replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase()).trim()

// 7. Refresh token toutes les 50 min
if (window.parent._twilioRefreshInterval) clearInterval(window.parent._twilioRefreshInterval)
window.parent._twilioRefreshInterval = setInterval(async () => {
  console.log('🔄 Refresh token Twilio...')
  try {
    const r2 = await fetch(`${supabaseUrl}/functions/v1/voip-generate-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
      body: JSON.stringify({ email })
    })
    const d2 = await r2.json()
    if (d2?.token) {
      const dev = globalThis.__ONE_DATA__?.device || window.parent._twilioDevice
      if (dev) await dev.updateToken(d2.token)
      console.log('✅ Token Twilio rafraîchi')
    }
  } catch (err) { console.error('❌ Erreur refresh token:', err?.message || err) }
}, 50 * 60 * 1000)

// 8. Appels entrants
device.on('incoming', (call) => {
  console.log('📲 Appel entrant de:', call.parameters.From)

  // Stocker dans TOUS les contextes
  if (!globalThis.__ONE_DATA__) globalThis.__ONE_DATA__ = {}
  globalThis.__ONE_DATA__.call = call

  if (frontWin) {
    if (!frontWin.__ONE_DATA__) frontWin.__ONE_DATA__ = {}
    frontWin.__ONE_DATA__.call = call
    frontWin._twilioCall = call
  }

  try { window._twilioCall = call } catch (e) { }
  try { window.parent._twilioCall = call } catch (e) { }
  try { window.top._twilioCall = call } catch (e) { }
  try { window.parent.__ONE_DATA__ = window.parent.__ONE_DATA__ || {}; window.parent.__ONE_DATA__.call = call } catch (e) { }

  // Infos client via customParameters
  const cp = call.customParameters || new Map()
  const idClient = cp.get('idClient') || 0
  const callerPhone = cp.get('callerPhone') || call.parameters.From
  const callerNameRaw = cp.get('callerName') || ''
  const nom0 = callerNameRaw ? cap(callerNameRaw) : callerPhone

  const ui = UI()
  if (ui) ui.incoming({ name: nom0, number: callerPhone, idvu: idClient, client: null })

  // Ligne CLIENT complète en arrière-plan
  const anonKey = wwLib.wwPlugins.supabase?.instance?.supabaseKey
  if (idClient) {
    fetch(`${supabaseUrl}/rest/v1/CLIENT?IDVu=eq.${encodeURIComponent(idClient)}&limit=1&select=*`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } })
      .then(r => r.json()).then(rows => {
        const client = rows?.[0] || null
        if (!client) return
        const ent = Number(client['idmultivu']) === 1
        const nom = ent
          ? [client['CIVILITE'], cap(client['NOM'])].filter(Boolean).join(' ')
          : [cap(client['PRENOM']), cap(client['NOM'])].filter(Boolean).join(' ')
        try { window.parent._twilioClientRow = client; window._twilioClientRow = client } catch (e) { }
        if (frontWin) try { frontWin._twilioClientRow = client } catch (e) { }
        const u = UI(); if (u) u.setName({ name: nom, number: callerPhone, idvu: idClient, client })
      }).catch(e => console.error(e))
  }

  // Appelant annule avant décrochage
  call.on('cancel', () => {
    console.log('📴 Appel annulé')
    const u = UI(); if (u) u.close()
    try { window._twilioCall = null; window.parent._twilioCall = null; window.top._twilioCall = null } catch (e) { }
    if (globalThis.__ONE_DATA__) globalThis.__ONE_DATA__.call = null
    if (frontWin && frontWin.__ONE_DATA__) frontWin.__ONE_DATA__.call = null
    // (rafraîchissement de l'ex-collection WeWeb retiré : elle est supprimée)
  })

  // Fin d'appel
  call.on('disconnect', () => {
    console.log('📴 Call disconnected')
    const duration = window.parent._twilioCallDuration || 0
    const hungUp = window.parent._twilioHungUp || false
    if (!hungUp) {
      const k = wwLib.wwPlugins.supabase?.instance?.supabaseKey
      fetch(`${supabaseUrl}/rest/v1/voip_calls?ended_at=is.null&status=eq.in-progress&order=created_at.desc&limit=1&select=id`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` } })
        .then(r => r.json()).then(rows => {
          const id = rows?.[0]?.id; if (!id) return
          fetch(`${supabaseUrl}/rest/v1/voip_calls?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', apikey: k, Authorization: `Bearer ${k}` },
            body: JSON.stringify({ ended_at: new Date().toISOString(), duration_seconds: duration, status: 'completed' })
          })
        }).catch(() => { })
    }
    try { window.parent._twilioHungUp = false } catch (e) { }
    const u = UI(); if (u) u.close()
    try { window._twilioCall = null; window.parent._twilioCall = null; window.top._twilioCall = null } catch (e) { }
    if (globalThis.__ONE_DATA__) globalThis.__ONE_DATA__.call = null
    if (frontWin && frontWin.__ONE_DATA__) frontWin.__ONE_DATA__.call = null
  })
})

device.on('error', (err) => {
  console.error('❌ Twilio Device error:', err?.message || err)
  const u = UI(); if (u) u.close()
})

device.on('unregistered', () => { console.warn('⚠️ Twilio Device unregistered') })

device.register()

console.log('✅ Twilio Device initialisé pour:', data.identity, '| Numéro:', data.phoneNumber)
return { success: true, identity: data.identity, phoneNumber: data.phoneNumber }
  }
});
