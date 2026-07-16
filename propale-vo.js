// ============================================================================
//  PROPALE VO (create / update) — module One Data (OD.define)  v1
//  Une seule définition pour les deux pages ; le mode vient de data-od-props
//  ({"mode":"create"} / {"mode":"update"}), avec repli sur l'URL.
//  Rendu dans __anchor ; URL + clé -> ctx.tenant ; client via ctx.supabase ;
//  détection par ROOT_ID + observateur retirés (le loader possède le cycle de vie).
// ============================================================================
/* =====================================================================
   PROPALE VO — One Data / CRM360
   Gère CREATE (div#propale-vo-create) et UPDATE (div#propale-vo-update)
   Le mode est détecté automatiquement par le ROOT_ID trouvé dans le DOM.
   ===================================================================== */
OD.define('propale-vo', {
  async mount(__anchor, ctx) {
  'use strict';

  /* ========================== CONFIG ========================== */
  const STICKY_TOP = 140;
  const ANNEE_BAREME = 2025;
  const TVA = 1.2;
  const SUPABASE_URL = ctx.tenant.supabase_url;
  const SUPABASE_KEY = ctx.tenant.supabase_anon_key;

  // Pages WeWeb
  const PAGE_PIPE        = '9e90d49a-215f-4c2b-b2bb-2d7c4f9aabd6';
  const PATH_PIPE        = '/fr/pipe-commercial';

  // Variables WeWeb
  const VAR_ID_PROPALE        = 'aac565e9-ad32-4f81-bf8d-adb611322e62';
  const VAR_TAXE_GESTION      = 'a7b18463-aeb8-456a-99ee-9ee0d8b4bca5';
  const VAR_TAXE_ACHEMINEMENT = 'cddb6b4a-7bec-4a8d-9fb5-ce940ea50398';
  const VAR_TAXE_PARAFISCALE  = 'f2a30399-02d6-4a95-bace-742f23a076f9';
  const VAR_SELECTED_SITE     = '63559984-eee4-4621-9145-b2a306333042';
  const VAR_SELECTED_CLIENT   = '55490583-c88b-4748-916e-4d203db07742';
  const VAR_SELECTED_VIN      = 'bcb187ac-e66e-4bfb-bc48-1b7b7dfda0ba';
  const COLL_USER             = 'e6331054-02e1-4f9d-b737-753455040b93';

  // Listes
  const LABELS      = ['Aucun', 'LABEL GROUPE', 'LABEL CONSTRUCTEUR'];
  const REGLEMENTS  = ['Comptant', 'Financement'];
  const FINANCEMENTS = { 'Comptant': ['Virement', 'CB'], 'Financement': ['Credit Classique', 'LOA', 'LLD', 'Crédit Bail'] };
  const ORGANISMES  = ['ALD', 'Parcours', 'RCI', 'CGI', 'TOYOTA Finance', 'CETELEM'];
  const CONTRATS    = ['Aucun', 'Entretien', 'Maintenance Particuliers', 'Maintenance Entreprises', 'Extension de garantie'];
  const FRAIS = [
    { key: 'Carburant',      label: 'Carburant',        site: 'ForfaitCarburant' },
    { key: 'GravageSimple',  label: 'Gravage',          site: 'GravageSimple'    },
    { key: 'KitSecuriteVO',  label: 'Kit de sécurité',  site: 'KitSecuriteVO'   },
    { key: 'Waxoyl',         label: 'Waxoyl',           site: 'Waxoyl'          },
    { key: 'FraisDeDossier', label: 'Frais de dossier', site: 'FraisDossier'    }
  ];

  /* ========================== UTILS ========================== */
  const supa = () => ctx.supabase;
  const fdoc = () => (__anchor.ownerDocument || document);
  const fwin = () => { try { return wwLib.getFrontWindow(); } catch(e) { return window; } };
  const getVar = id => { try { return wwLib.wwVariable.getValue(id); } catch(e) { return null; } };
  const setVar = (id, v) => { try { wwLib.wwVariable.updateValue(id, v); } catch(e) {} };

  function inEditor() { try { return window.self !== window.top; } catch(e) { return true; } }

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-]/g,''));
    return isNaN(n) ? 0 : n;
  }
  function eur(n) {
    const v = Math.round((num(n) + Number.EPSILON) * 100) / 100;
    return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function deptFromCP(cp) {
    cp = String(cp || '').trim();
    if (!cp) return null;
    if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0,3);
    if (cp.startsWith('20')) return '2A';
    return cp.slice(0,2);
  }
  function ageAns(mec) {
    if (!mec) return 0;
    const d = new Date(mec);
    return isNaN(d.getTime()) ? 0 : (Date.now() - d.getTime()) / (365.25*24*3600*1000);
  }
  function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('fr-FR'); } catch(e) { return d; } }

  /* ========================== ÉTAT ========================== */
  const ST = {
    mode: 'create', rootId: '', P: {},
    vehicule: null, client: null, site: null,
    tarifCV: 0, exoPct: 0, malus: 0,
    taxeGestion: 0, taxeAcheminement: 0, taxeParafiscale: 0,
    loaded: false, saving: false
  };

  /* ========================== CHARGEMENT ========================== */
  async function loadData() {
    const sb = supa();
    ST.taxeGestion      = num(getVar(VAR_TAXE_GESTION));
    ST.taxeAcheminement = num(getVar(VAR_TAXE_ACHEMINEMENT));
    ST.taxeParafiscale  = num(getVar(VAR_TAXE_PARAFISCALE));

    if (ST.mode === 'update') {
      const idProp = num(getVar(VAR_ID_PROPALE));
      if (!idProp) throw new Error('Aucun id_propale_bdc dans la variable WeWeb ' + VAR_ID_PROPALE);
      const { data, error } = await sb.from('PROPALE_BDC').select('*').eq('id_propale_bdc', idProp).single();
      if (error) throw error;
      ST.P = data || {};
    } else {
      // Mode CREATE : lit les variables contexte
      const vinObj  = getVar(VAR_SELECTED_VIN);
      const cliObj  = getVar(VAR_SELECTED_CLIENT);
      const siteVal = getVar(VAR_SELECTED_SITE);
      const vin      = vinObj  && typeof vinObj  === 'object' ? vinObj.VIN   : vinObj;
      const idClient = cliObj  && typeof cliObj  === 'object' ? cliObj.IDVu  : cliObj;
      const idSite   = siteVal && typeof siteVal === 'object' ? (siteVal.ID_SITE ?? siteVal.id_site) : siteVal;
      ST.P = {
        id_propale_bdc: null, id_client_vu: num(idClient) || null,
        VIN: vin || null, id_site: num(idSite) || null,
        VN_VO: 'VO', status: 'draft', HT: false, Archived: false
      };
    }

    await loadRelations();
    await loadBaremes();
    ST.loaded = true;
  }

  async function loadRelations() {
    const sb = supa(), P = ST.P;
    if (P.VIN) {
      const { data } = await sb.from('STOCKVO').select('*').eq('VIN', P.VIN).limit(1);
      ST.vehicule = (data && data[0]) || null;
    }
    if (P.id_client_vu) {
      const { data } = await sb.from('CLIENT').select('*').eq('IDVu', P.id_client_vu).limit(1);
      ST.client = (data && data[0]) || null;
    }
    if (P.id_site) {
      const { data } = await sb.from('SITE').select('*').eq('ID_SITE', P.id_site).limit(1);
      ST.site = (data && data[0]) || null;
    }
  }

  async function loadBaremes() {
    const sb = supa();
    const dept = deptFromCP(ST.client && ST.client.code_postal);
    if (dept) {
      const { data } = await sb.from('bareme_cheval_fiscal').select('montant_cv_eur,exo_vehicule_propre_pct').eq('departement_code', dept).maybeSingle();
      if (data) { ST.tarifCV = num(data.montant_cv_eur); ST.exoPct = num(data.exo_vehicule_propre_pct); }
    }
    const co2 = ST.vehicule ? Math.round(num(ST.vehicule.TAUX_CO2)) : 0;
    if (co2 > 0) {
      const { data } = await sb.from('bareme_malus_co2').select('malus_eur').eq('annee', ANNEE_BAREME).eq('gram_co2', co2).maybeSingle();
      ST.malus = data ? num(data.malus_eur) : 0;
    }
  }

  /* ========================== CALCULS ========================== */
  function htFactor() { return ST.P.HT ? (1/TVA) : 1; }

  function calc() {
    const P = ST.P, f = htFactor();
    const prixVehiculeTTC = ST.vehicule ? num(ST.vehicule.PVENTE) : 0;
    let totalAccTTC = 0;
    for (let i = 1; i <= 10; i++) totalAccTTC += num(P['Accessoire' + i + 'Tarif']);
    const prixVehicule   = prixVehiculeTTC * f;
    const totalAccessoires = totalAccTTC * f;
    const totalVehicule  = prixVehicule + totalAccessoires;
    const remisePct      = totalVehicule * (num(P.ParComPourcent) / 100);
    const remisesMontant = (num(P.Remise1Montant) + num(P.Remise2Montant) + num(P.Remise3Montant)) * f;
    const totalRemises   = remisePct + remisesMontant;
    const cg = calcCG();
    let totalFrais = 0;
    FRAIS.forEach(o => { if (P[o.key] && ST.site) totalFrais += num(ST.site[o.site]); });
    totalFrais *= f;
    const totalBDC = totalVehicule - totalRemises + cg.total + totalFrais;
    return { prixVehicule, totalAccessoires, totalVehicule, remisePct, remisesMontant, totalRemises, cg, totalFrais, totalBDC };
  }

  function calcCG() {
    const P = ST.P;
    const cv = num(P.PuissanceFiscale);
    let Y1 = cv * ST.tarifCV;
    if (ageAns(ST.vehicule && ST.vehicule.D_1MEC) > 10) Y1 *= 0.5;
    if (P.Hybride) Y1 *= (1 - ST.exoPct/100);
    const Y2 = P.TaxeParafiscale ? ST.taxeParafiscale : 0;
    const Y3 = ST.malus;
    const Y4 = ST.taxeGestion;
    const Y5 = ST.taxeAcheminement;
    return { Y1, Y2, Y3, Y4, Y5, total: Y1+Y2+Y3+Y4+Y5 };
  }

  /* ========================== STYLE ========================== */
  const CSS = `
  .pv-wrap{max-width:1200px;margin:0 auto;font-family:"Nunito Sans",system-ui,sans-serif;color:#1c2b45}
  .pv-wrap *{box-sizing:border-box}
  .pv-grid{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
  @media(max-width:860px){.pv-grid{grid-template-columns:1fr}.pv-rightcol{position:static!important;max-height:none!important}.pv-top{position:static!important}}
  @media(max-width:560px){.pv-top{flex-wrap:wrap;gap:8px}.pv-ctx{flex-wrap:wrap;gap:6px}.pv-sep{display:none}.pv-row{grid-template-columns:1fr!important}.pv-card-b{padding:12px!important}.pv-sum-b{padding:6px 12px 12px!important}}
  .pv-col{display:flex;flex-direction:column;gap:16px}
  .pv-rightcol{position:sticky;top:${STICKY_TOP+78}px;align-self:start;max-height:calc(100vh - ${STICKY_TOP+94}px);overflow-y:auto;padding:2px}
  .pv-top{background:#fff;border:1px solid #e3edf9;border-radius:14px;padding:12px 18px;display:flex;align-items:center;gap:14px;flex-wrap:nowrap;margin-bottom:18px;box-shadow:0 2px 8px rgba(28,43,69,.08);position:sticky;top:${STICKY_TOP}px;z-index:20}
  .pv-title{font-size:15px;font-weight:800;color:#2a5ea9;display:flex;align-items:center;gap:9px;white-space:nowrap;flex-shrink:0}
  .pv-tag{font-size:11px;font-weight:800;color:#fff;background:#fac055;border-radius:6px;padding:3px 9px}
  .pv-ctx{display:flex;gap:0;flex:1;overflow:hidden;min-width:0;align-items:center;flex-wrap:wrap}
  .pv-sep{width:1px;height:30px;background:#e3edf9;flex-shrink:0;margin:0 12px}
  .pv-chip{display:flex;flex-direction:column;justify-content:center;min-width:0}
  .pv-chip b{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1c2b45}
  .pv-chip span{font-size:9px;color:#7a98c5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}
  .pv-chip-detail{font-size:11px;color:#7a98c5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pv-label-sel{border:1.5px solid #acc5e4;border-radius:7px;padding:5px 9px;font-size:13px;font-weight:700;color:#2a5ea9;background:#fff;cursor:pointer;font-family:inherit}
  .pv-ht{display:flex;align-items:center;gap:10px;background:#f5f8fc;border:1px solid #e3edf9;border-radius:30px;padding:6px 8px 6px 14px;cursor:pointer;user-select:none;flex-shrink:0}
  .pv-ht span{font-size:12px;font-weight:700;color:#7a98c5} .pv-ht .on{color:#3a8a76;font-weight:800}
  .pv-switch{width:42px;height:24px;border-radius:30px;background:#53bda7;position:relative;transition:.15s}
  .pv-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.15s}
  .pv-switch.ht{background:#2a5ea9} .pv-switch.ht::after{left:21px}
  .pv-card{background:#fff;border:1px solid #e3edf9;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(28,43,69,.04)}
  .pv-card-h{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e3edf9;background:#f5f8fc;cursor:pointer;user-select:none}
  .pv-card-t{font-size:12px;font-weight:800;color:#2a5ea9;text-transform:uppercase;letter-spacing:.5px}
  .pv-card-b{padding:16px 18px}
  .pv-card.collapsed .pv-card-b{display:none}
  .pv-chev{color:#7a98c5;font-size:14px;transition:.15s;flex-shrink:0} .pv-card.collapsed .pv-chev{transform:rotate(-90deg)}
  .pv-row{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
  .pv-f{display:flex;flex-direction:column;gap:4px} .pv-f.full{grid-column:1/-1}
  .pv-f label{font-size:10px;font-weight:700;color:#7a98c5;text-transform:uppercase;letter-spacing:.4px}
  .pv-in{border:1px solid #d9e3f2;border-radius:7px;padding:9px 11px;font-size:13px;color:#1c2b45;background:#fff;font-family:inherit;width:100%;transition:border-color .12s}
  .pv-in:focus{outline:none;border-color:#2a5ea9}
  .pv-in.ro{background:#f5f8fc;color:#1c2b45;font-weight:700}
  select.pv-in{cursor:pointer}
  textarea.pv-in{resize:vertical;min-height:70px}
  .pv-veh{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}
  .pv-veh-name{font-size:16px;font-weight:800;flex:1;min-width:0}
  .pv-veh-sub{font-size:11px;color:#7a98c5;margin-top:3px;line-height:1.5}
  .pv-veh-price{font-size:20px;font-weight:800;color:#2a5ea9;white-space:nowrap}
  /* Client card */
  .pv-cli{background:#f0f6ff;border:1px solid #d0dff5;border-radius:10px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start}
  .pv-cli-av{width:38px;height:38px;border-radius:50%;background:#2a5ea9;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}
  .pv-cli-name{font-size:15px;font-weight:800;color:#1c2b45}
  .pv-cli-rows{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:4px}
  .pv-cli-item{font-size:12px;color:#5a7ba8;display:flex;align-items:center;gap:4px}
  .pv-opt{display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #f5f8fc} .pv-opt:last-child{border-bottom:none}
  .pv-cb{width:20px;height:20px;border-radius:6px;border:2px solid #cdd9ec;flex-shrink:0;position:relative;cursor:pointer;transition:all .12s}
  .pv-cb.on{background:#53bda7;border-color:#53bda7} .pv-cb.on::after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
  .pv-opt-lbl{flex:1;font-size:13px;font-weight:600} .pv-opt-price{font-size:13px;font-weight:700}
  .pv-acc-n{display:grid;grid-template-columns:24px 1fr 130px;gap:8px;align-items:center;margin-bottom:6px}
  .pv-acc-i{font-size:11px;font-weight:700;color:#acc5e4;text-align:center}
  .pv-line{display:grid;grid-template-columns:1fr 130px;gap:10px;margin-bottom:8px}
  .pv-toggle{display:flex;align-items:center;gap:8px}
  .pv-msw{width:36px;height:21px;border-radius:30px;background:#cdd9ec;position:relative;cursor:pointer;transition:background .15s}
  .pv-msw.on{background:#53bda7} .pv-msw::after{content:"";position:absolute;top:3px;left:3px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .15s} .pv-msw.on::after{left:18px}
  .pv-sum{background:#fff;border:1px solid #e3edf9;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(28,43,69,.08)}
  .pv-sum-h{padding:12px 18px;background:#2a5ea9;color:#fff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
  .pv-sum-b{padding:6px 18px 16px}
  .pv-sl{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px;border-bottom:1px solid #f5f8fc}
  .pv-sl span{color:#7a98c5;font-weight:600} .pv-sl b{font-weight:700}
  .pv-sl.minus b{color:#e24b4a}
  .pv-sl.sub{border-top:1px solid #e3edf9;border-bottom:none} .pv-sl.sub span,.pv-sl.sub b{color:#2a5ea9;font-weight:800}
  .pv-total{background:#53bda7;color:#fff;border-radius:11px;padding:13px 15px;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;box-shadow:0 3px 10px rgba(83,189,167,.35)}
  .pv-total span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;line-height:1.15}
  .pv-total b{font-size:19px;font-weight:800;white-space:nowrap}
  .pv-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
  .pv-btn{padding:11px;border-radius:9px;font-size:13px;font-weight:700;border:1px solid transparent;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .12s}
  .pv-btn-primary{background:#53bda7;color:#fff} .pv-btn-primary:hover{background:#3a9e8a} .pv-btn-primary:disabled{opacity:.5;cursor:default}
  .pv-btn-blue{background:#2a5ea9;color:#fff} .pv-btn-blue:hover{background:#1f4a87}
  .pv-btn-ghost{background:#fff;color:#2a5ea9;border-color:#2a5ea9} .pv-btn-ghost:hover{background:#f2f6fc}
  .pv-btn-grey{background:#eef3f9;color:#5a6b88;border:1px solid #d9e3f2}
  .pv-cgline{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:12px;border-bottom:1px solid #f5f8fc}
  .pv-cgline span{color:#7a98c5} .pv-cgline b{font-weight:700}
  .pv-cgcb{display:flex;gap:18px;margin-bottom:12px;flex-wrap:wrap}
  .pv-cgcb label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;cursor:pointer}
  .pv-err{background:#fcebeb;color:#e24b4a;border:1px solid #f5a5a5;border-radius:8px;padding:12px 16px;font-size:13px;font-weight:600;margin-bottom:14px}
  `;

  /* ========================== RENDER ========================== */
  function render(root) {
    const P = ST.P, vh = ST.vehicule || {}, cl = ST.client || {}, si = ST.site || {};
    if (!P.LABEL) P.LABEL = 'Aucun';

    const vehName = [vh.MARQUE_DMS, vh.MODELE_DMS].filter(Boolean).join(' ') || (P.VIN || '—');
    const vehSub  = [vh.DESIGNATION_DMS, vh.D_1MEC ? 'MEC '+fmtDate(vh.D_1MEC) : '', vh.TAUX_CO2 ? num(vh.TAUX_CO2)+' g CO₂' : ''].filter(Boolean).join(' · ');
    const clientName   = [cl.CIVILITE, cl.NOM, cl.PRENOM].filter(Boolean).join(' ') || ('Client #'+(P.id_client_vu||'—'));
    const clientInitials = ((cl.PRENOM||'?')[0]+(cl.NOM||'?')[0]).toUpperCase();
    const siteName = si.NomSite || si.SITE || si.RaisonSociale || ('Site #'+(P.id_site||'—'));
    const modeLabel = ST.mode === 'create' ? 'Création' : 'Modification';

    root.innerHTML = `<style>${CSS}</style><div class="pv-wrap">
      <div class="pv-top">
        <div class="pv-title"><span class="pv-tag">VO</span>${modeLabel} — Proposition</div>
        <div class="pv-ctx">
          <div class="pv-chip" style="max-width:220px">
            <span>Véhicule</span>
            <b>${esc(vehName)}</b>
            ${P.VIN ? `<div class="pv-chip-detail">${esc(P.VIN)}</div>` : ''}
          </div>
          <div class="pv-sep"></div>
          <div class="pv-chip" style="max-width:180px"><span>Point de vente</span><b>${esc(siteName)}</b></div>
          <div class="pv-sep"></div>
          <div class="pv-chip"><span>Label</span>
            <select class="pv-label-sel" data-key="LABEL">${LABELS.map(x=>`<option value="${esc(x)}"${P.LABEL===x?' selected':''}>${esc(x)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="pv-ht" data-act="ht">
          <span class="${P.HT?'':'on'}">TTC</span>
          <div class="pv-switch ${P.HT?'ht':''}"></div>
          <span class="${P.HT?'on':''}">HT</span>
        </div>
      </div>
      <div class="pv-grid">
        <div class="pv-col" id="pv-left"></div>
        <div class="pv-rightcol">
          <div class="pv-sum"><div class="pv-sum-h">Récapitulatif</div><div class="pv-sum-b" id="pv-sum"></div></div>
        </div>
      </div>
    </div>`;

    const left = root.querySelector('#pv-left');

    // — Client
    left.appendChild(buildClientCard(cl, clientName, clientInitials));

    // — Véhicule
    left.appendChild(mkCard('Véhicule d\'occasion', `
      <div class="pv-veh">
        <div style="flex:1;min-width:0">
          <div class="pv-veh-name">${esc(vehName)}</div>
          <div class="pv-veh-sub">${esc(vehSub)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;color:#7a98c5;text-transform:uppercase;margin-bottom:2px">Prix de vente</div>
          <div class="pv-veh-price" id="pv-prixv">${eur(num(vh.PVENTE))}</div>
        </div>
      </div>`));

    // — Reprise
    left.appendChild(buildReprise());

    // — Accessoires
    left.appendChild(buildAccessoires());

    // — Remises
    left.appendChild(buildRemises());

    // — Financement
    left.appendChild(buildFinancement());

    // — Carte grise
    left.appendChild(buildCarteGrise());

    // — Frais
    left.appendChild(buildFrais());

    // Tous repliés sauf client et véhicule
    left.querySelectorAll('.pv-card').forEach((c,i) => { if (i >= 2) c.classList.add('collapsed'); });

    bindEvents(root);
    refreshTotals(root);
  }

  function mkCard(title, bodyHtml, extra) {
    const d = fdoc().createElement('div');
    d.className = 'pv-card';
    d.innerHTML = `<div class="pv-card-h" data-toggle>
      <div class="pv-card-t">${title}</div>
      ${extra || '<span class="pv-chev">▾</span>'}
    </div><div class="pv-card-b">${bodyHtml}</div>`;
    return d;
  }

  function buildClientCard(cl, clientName, initials) {
    const tel   = cl.TEl_MOB || cl.TEL_FIXE || '';
    const email = cl.EMAIL || '';
    const adr   = [cl.ADRESSE, [cl.code_postal,cl.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const bday  = cl.BIRTHDAY ? fmtDate(cl.BIRTHDAY) : '';
    const rows  = [
      tel   ? `<div class="pv-cli-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="2" width="10" height="20" rx="2"/></svg>${esc(tel)}</div>` : '',
      email ? `<div class="pv-cli-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${esc(email)}</div>` : '',
      adr   ? `<div class="pv-cli-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(adr)}</div>` : '',
      bday  ? `<div class="pv-cli-item">🎂 ${esc(bday)}</div>` : '',
    ].filter(Boolean).join('');
    return mkCard('Client', `
      <div class="pv-cli">
        <div class="pv-cli-av">${esc(initials)}</div>
        <div style="flex:1;min-width:0">
          <div class="pv-cli-name">${esc(clientName)}</div>
          <div class="pv-cli-rows">${rows || '<span style="color:#9bb3d1;font-size:12px">Aucune information complémentaire</span>'}</div>
        </div>
      </div>`);
  }

  function fld(label, key, opts) {
    opts = opts || {};
    const v = ST.P[key];
    const cls = 'pv-f' + (opts.full ? ' full' : '');
    const val = (opts.type==='date' && v) ? String(v).slice(0,10) : (v==null?'':v);
    if (opts.select) {
      const options = opts.select.map(x => `<option value="${esc(x)}"${String(v)===String(x)?' selected':''}>${esc(x)}</option>`).join('');
      return `<div class="${cls}"><label>${esc(label)}</label><select class="pv-in" data-key="${key}"><option value=""></option>${options}</select></div>`;
    }
    if (opts.textarea) return `<div class="${cls}"><label>${esc(label)}</label><textarea class="pv-in" rows="3" data-key="${key}">${esc(v)}</textarea></div>`;
    return `<div class="${cls}"><label>${esc(label)}</label><input class="pv-in${opts.ro?' ro':''}" type="${opts.type||'text'}" data-key="${key}" value="${esc(val)}"${opts.ro?' disabled':''}></div>`;
  }

  function buildReprise() {
    const P = ST.P;
    const d = fdoc().createElement('div');
    d.className = 'pv-card';
    d.innerHTML = `<div class="pv-card-h" data-toggle>
      <div class="pv-card-t">Véhicule de reprise</div>
      <div style="display:flex;align-items:center;gap:8px" data-stop>
        <span style="font-size:11px;color:#7a98c5;font-weight:700">Reprise</span>
        <div class="pv-msw ${P.RepriseVehicule?'on':''}" data-act="reprise"></div>
      </div>
    </div>
    <div class="pv-card-b ${P.RepriseVehicule?'':'pv-hide'}" id="pv-reprise-b">
      <div class="pv-row">
        ${fld('Marque','MarqueReprise')}${fld('Modèle','ModeleReprise')}
        ${fld('Version','VersionReprise')}${fld('Kilométrage','KmReprise',{type:'number'})}
        ${fld('VIN','VINReprise')}${fld('Immatriculation','ImmatReprise')}
        ${fld('1ʳᵉ mise en circulation','MECReprise',{type:'date'})}
        <div class="pv-f"><label>Pour la casse</label><div class="pv-toggle"><div class="pv-msw ${P.CasseReprise?'on':''}" data-act="casse"></div></div></div>
        ${fld('Valeur reprise TTC','ValeurReprise',{type:'number'})}
        ${fld('Observations','Observations',{textarea:true,full:true})}
      </div>
    </div>`;
    return d;
  }

  function buildAccessoires() {
    let h = '';
    for (let i=1; i<=10; i++) {
      h += `<div class="pv-acc-n">
        <div class="pv-acc-i">${i}</div>
        <input class="pv-in" type="text" placeholder="Libellé" data-key="Accessoire${i}Text" value="${esc(ST.P['Accessoire'+i+'Text'])}">
        <input class="pv-in" type="number" placeholder="Montant TTC" data-key="Accessoire${i}Tarif" value="${esc(ST.P['Accessoire'+i+'Tarif'])}">
      </div>`;
    }
    return mkCard('Accessoires', h);
  }

  function buildRemises() {
    let lines = '';
    for (let i=1; i<=3; i++) {
      lines += `<div class="pv-line">
        <input class="pv-in" type="text" placeholder="Libellé remise ${i}" data-key="Remise${i}" value="${esc(ST.P['Remise'+i])}">
        <input class="pv-in" type="number" placeholder="Montant" data-key="Remise${i}Montant" value="${esc(ST.P['Remise'+i+'Montant'])}">
      </div>`;
    }
    return mkCard('Remises', `<div class="pv-row" style="margin-bottom:12px">
      ${fld('% de remise globale','ParComPourcent',{type:'number'})}
      <div class="pv-f"></div>
    </div>${lines}`);
  }

  function buildFinancement() {
    const P = ST.P;
    const finOpts = (FINANCEMENTS[P.TypePaiement] || []);
    return mkCard('Infos financement & BDC', `<div class="pv-row" id="pv-fin-rows">
      ${fld('Règlement','TypePaiement',{select:REGLEMENTS})}
      <div class="pv-f" id="pv-fin-f">${fld('Financement','TypeFinancement',{select:finOpts}).replace(/^<div[^>]*>|<\/div>$/g,'')}</div>
      <div class="pv-f" id="pv-org-f">${fld('Organisme','OrganismeFinancement',{select:ORGANISMES}).replace(/^<div[^>]*>|<\/div>$/g,'')}</div>
      ${fld('Contrat de service','Contrat_Service',{select:CONTRATS})}
      ${fld('Montant financé TTC','MontantFinance',{type:'number'})}
      ${fld('Nb de mensualités','NombreMensualites',{type:'number'})}
      ${fld('Mensualité TTC','MontantMensualitesTTC',{type:'number'})}
      <div class="pv-f pv-loa">${fld('Engagement reprise TTC','MontantTTCEngagement',{type:'number'}).replace(/^<div[^>]*>|<\/div>$/g,'')}</div>
      <div class="pv-f pv-loa">${fld('Kilométrage annuel ER','KM_ANNUEL',{type:'number'}).replace(/^<div[^>]*>|<\/div>$/g,'')}</div>
      ${fld('Apport TTC','Apport',{type:'number'})}
      ${fld('Lieu de commande','LieuCommande')}
      ${fld('Lieu de livraison','LieuLivraison')}
      ${fld('Date de livraison','DateLivraison',{type:'date'})}
      ${fld('Commentaires','Commentaire',{textarea:true,full:true})}
    </div>`);
  }

  function buildCarteGrise() {
    const P = ST.P;
    return mkCard('Carte grise & taxes', `
      <div class="pv-cgcb">
        <label><div class="pv-cb ${P.Hybride?'on':''}" data-act="hybride"></div>Électrique / Hybride</label>
        <label><div class="pv-cb ${P.TaxeParafiscale?'on':''}" data-act="parafiscale"></div>Taxe parafiscale</label>
      </div>
      <div class="pv-row"><div class="pv-f">${fld('Puissance fiscale (CV)','PuissanceFiscale',{type:'number'}).replace(/^<div[^>]*>|<\/div>$/g,'')}</div><div class="pv-f"></div></div>
      <div id="pv-cg-detail" style="margin-top:12px"></div>`);
  }

  function buildFrais() {
    const items = FRAIS.map(o => {
      const price = ST.site ? num(ST.site[o.site]) : 0;
      return `<div class="pv-opt">
        <div class="pv-cb ${ST.P[o.key]?'on':''}" data-act="frais" data-frais="${o.key}"></div>
        <div class="pv-opt-lbl">${esc(o.label)}</div>
        <div class="pv-opt-price">${eur(price)}</div>
      </div>`;
    }).join('');
    return mkCard('Frais & options', items);
  }

  /* ========================== EVENTS ========================== */
  function bindEvents(root) {
    root.addEventListener('input', e => {
      const k = e.target.getAttribute && e.target.getAttribute('data-key');
      if (!k) return;
      ST.P[k] = e.target.type === 'number' ? (e.target.value === '' ? null : num(e.target.value)) : e.target.value;
      refreshTotals(root);
    });
    root.addEventListener('change', e => {
      const k = e.target.getAttribute && e.target.getAttribute('data-key');
      if (!k) return;
      ST.P[k] = e.target.value;
      if (k === 'TypePaiement') {
        const sel = root.querySelector('select[data-key="TypeFinancement"]');
        if (sel) {
          const opts = FINANCEMENTS[ST.P.TypePaiement] || [];
          sel.innerHTML = '<option value=""></option>' + opts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
          ST.P.TypeFinancement = '';
        }
      }
      refreshUI(root);
    });
    root.addEventListener('click', e => {
      const t = e.target;
      const h = t.closest('.pv-card-h');
      if (h && !t.closest('[data-stop]')) { h.parentElement.classList.toggle('collapsed'); return; }
      const el = t.getAttribute('data-act') ? t : t.closest('[data-act]');
      if (!el) return;
      const act = el.getAttribute('data-act');
      e.stopPropagation();
      if (act==='ht') { ST.P.HT = !ST.P.HT; refreshUI(root); }
      else if (act==='reprise') { ST.P.RepriseVehicule = !ST.P.RepriseVehicule; refreshUI(root); }
      else if (act==='casse') { ST.P.CasseReprise = !ST.P.CasseReprise; refreshUI(root); }
      else if (act==='hybride') { ST.P.Hybride = !ST.P.Hybride; refreshUI(root); }
      else if (act==='parafiscale') { ST.P.TaxeParafiscale = !ST.P.TaxeParafiscale; refreshUI(root); }
      else if (act==='frais') { const k = el.getAttribute('data-frais'); if(k) { ST.P[k]=!ST.P[k]; refreshUI(root); } }
      else if (act==='annuler') { goPipe(); }
      else if (act==='save') { doSave(root,'save'); }
      else if (act==='promote') { doSave(root,'promote'); }
    });
  }

  /* ========================== REFRESH UI ========================== */
  function refreshUI(root) {
    // Reprise
    const repB = root.querySelector('#pv-reprise-b');
    if (repB) repB.classList.toggle('pv-hide', !ST.P.RepriseVehicule);
    const repSw = root.querySelector('[data-act="reprise"]'); if (repSw) repSw.classList.toggle('on', !!ST.P.RepriseVehicule);
    const casseSw = root.querySelector('[data-act="casse"]'); if (casseSw) casseSw.classList.toggle('on', !!ST.P.CasseReprise);
    // Toggles CG
    ['hybride','parafiscale'].forEach(a => { const el=root.querySelector('[data-act="'+a+'"]'); if(el) el.classList.toggle('on',!!ST.P[a==='hybride'?'Hybride':'TaxeParafiscale']); });
    // Frais
    FRAIS.forEach(o => { const cb=root.querySelector('[data-frais="'+o.key+'"]'); if(cb) cb.classList.toggle('on',!!ST.P[o.key]); });
    // HT switch
    const sw=root.querySelector('.pv-switch'); if(sw) sw.classList.toggle('ht',!!ST.P.HT);
    const hts=root.querySelectorAll('.pv-ht span'); if(hts.length===2){hts[0].classList.toggle('on',!ST.P.HT);hts[1].classList.toggle('on',!!ST.P.HT);}
    // Financement : masque organisme si comptant, champs LOA
    const isCompt = ST.P.TypePaiement === 'Comptant';
    const orgF = root.querySelector('#pv-org-f'); if(orgF) orgF.style.display = isCompt?'none':'';
    const isLOA = ST.P.TypeFinancement === 'LOA';
    root.querySelectorAll('.pv-loa').forEach(x => x.style.display = isLOA?'':'none');
    refreshTotals(root);
  }

  function refreshTotals(root) {
    const r = calc();
    const suf = ST.P.HT ? ' HT' : ' TTC';
    const pv = root.querySelector('#pv-prixv'); if(pv) pv.textContent = eur(r.prixVehicule);
    // Détail carte grise
    const cgd = root.querySelector('#pv-cg-detail');
    if (cgd) cgd.innerHTML = `
      <div class="pv-cgline"><span>${num(ST.P.PuissanceFiscale)} CV × ${eur(ST.tarifCV)}${ST.exoPct&&ST.P.Hybride?' (exo '+ST.exoPct+'%)':''}</span><b>${eur(r.cg.Y1)}</b></div>
      <div class="pv-cgline"><span>Malus écologique</span><b>${eur(r.cg.Y3)}</b></div>
      ${r.cg.Y2?`<div class="pv-cgline"><span>Taxe parafiscale</span><b>${eur(r.cg.Y2)}</b></div>`:''}
      <div class="pv-cgline"><span>Taxe de gestion</span><b>${eur(r.cg.Y4)}</b></div>
      <div class="pv-cgline"><span>Taxe d'acheminement</span><b>${eur(r.cg.Y5)}</b></div>
      <div class="pv-cgline" style="border-bottom:none"><span style="color:#2a5ea9;font-weight:800">Total carte grise</span><b style="color:#2a5ea9">${eur(r.cg.total)}</b></div>`;
    // Récap
    const sum = root.querySelector('#pv-sum');
    if (sum) sum.innerHTML = `
      <div class="pv-sl"><span>Prix véhicule</span><b>${eur(r.prixVehicule)}</b></div>
      <div class="pv-sl"><span>Accessoires</span><b>${eur(r.totalAccessoires)}</b></div>
      <div class="pv-sl minus"><span>Remises</span><b>− ${eur(r.totalRemises)}</b></div>
      <div class="pv-sl"><span>Carte grise</span><b>${eur(r.cg.total)}</b></div>
      <div class="pv-sl"><span>Frais &amp; options</span><b>${eur(r.totalFrais)}</b></div>
      <div class="pv-total"><span>Total commande${suf}</span><b>${eur(r.totalBDC)}</b></div>
      <div class="pv-actions">${buildButtons()}</div>`;
  }

  function buildButtons() {
    const isCreate = ST.mode === 'create' || ST.P.status === 'draft';
    let extra = '';
    if (ST.mode === 'update') {
      if (ST.P.status === 'draft') extra = `<button class="pv-btn pv-btn-blue" data-act="promote">Définir comme proposition</button>`;
      else if (ST.P.status === 'propale') extra = `<button class="pv-btn pv-btn-grey" data-act="promote">Nouveau brouillon</button>`;
    }
    const lbl = ST.mode==='create' ? 'Enregistrer le brouillon' : 'Enregistrer';
    return `<button class="pv-btn pv-btn-primary" data-act="save"${ST.saving?' disabled':''}>${lbl}</button>
            ${extra}
            <button class="pv-btn pv-btn-ghost" data-act="annuler">Annuler</button>`;
  }

  /* ========================== SAVE ========================== */
  function buildPayload() {
    const P = ST.P, r = calc();
    const out = {
      id_client_vu: P.id_client_vu, VIN: P.VIN, id_site: P.id_site, VN_VO: 'VO',
      LABEL: P.LABEL || null, HT: !!P.HT,
      RepriseVehicule: !!P.RepriseVehicule,
      MarqueReprise: P.MarqueReprise||null, ModeleReprise: P.ModeleReprise||null,
      VersionReprise: P.VersionReprise||null, KmReprise: num(P.KmReprise)||null,
      VINReprise: P.VINReprise||null, ImmatReprise: P.ImmatReprise||null,
      MECReprise: P.MECReprise||null, ValeurReprise: num(P.ValeurReprise)||null,
      CasseReprise: !!P.CasseReprise, Observations: P.Observations||null,
      TypePaiement: P.TypePaiement||null, TypeFinancement: P.TypeFinancement||null,
      OrganismeFinancement: P.OrganismeFinancement||null, Contrat_Service: P.Contrat_Service||null,
      MontantFinance: num(P.MontantFinance)||null, NombreMensualites: num(P.NombreMensualites)||null,
      MontantMensualitesTTC: num(P.MontantMensualitesTTC)||null, NombreAssurance: num(P.NombreAssurance)||null,
      MontantTTCEngagement: num(P.MontantTTCEngagement)||null, KM_ANNUEL: num(P.KM_ANNUEL)||null,
      Apport: num(P.Apport)||null, LieuCommande: P.LieuCommande||null,
      LieuLivraison: P.LieuLivraison||null, DateLivraison: P.DateLivraison||null,
      Commentaire: P.Commentaire||null,
      ParComPourcent: num(P.ParComPourcent)||null,
      Remise1: P.Remise1||null, Remise1Montant: num(P.Remise1Montant)||null,
      Remise2: P.Remise2||null, Remise2Montant: num(P.Remise2Montant)||null,
      Remise3: P.Remise3||null, Remise3Montant: num(P.Remise3Montant)||null,
      PuissanceFiscale: num(P.PuissanceFiscale)||null, MTCarteGrise: r.cg.total,
      Hybride: !!P.Hybride, TaxeParafiscale: !!P.TaxeParafiscale,
      TotalProp: r.totalBDC
    };
    FRAIS.forEach(o => out[o.key] = !!P[o.key]);
    for (let i=1; i<=10; i++) {
      out['Accessoire'+i+'Text']  = P['Accessoire'+i+'Text']  || null;
      out['Accessoire'+i+'Tarif'] = num(P['Accessoire'+i+'Tarif']) || null;
    }
    return out;
  }

  function getCurrentUserId() {
    try {
      let row = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser;
      if (Array.isArray(row)) row = row[0];
      return row ? Number(row.ID_User || row.id_user || 0) || null : null;
    } catch(e) { return null; }
  }

  async function doSave(root, intent) {
    if (ST.saving) return;
    ST.saving = true; refreshTotals(root);
    const sb = supa();
    try {
      const payload = buildPayload();
      const userId = getCurrentUserId();
      const now = new Date().toISOString();
      console.log('[propaleVO] doSave start', { mode: ST.mode, intent, userId, vin: ST.P.VIN, idClient: ST.P.id_client_vu });

      if (ST.mode === 'create') {
        // Récupère le prochain id
        const { data: mx, error: mxErr } = await sb.from('PROPALE_BDC').select('id_propale_bdc').order('id_propale_bdc',{ascending:false}).limit(1);
        if (mxErr) throw mxErr;
        const newId = ((mx && mx[0]) ? num(mx[0].id_propale_bdc) : 0) + 1;
        console.log('[propaleVO] newId =', newId);
        const ins = Object.assign({}, payload, {
          id_propale_bdc: newId, status: 'draft', Archived: false,
          id_user_creation: userId, created_at: now, updated_at: now
        });
        console.log('[propaleVO] INSERT payload keys:', Object.keys(ins).join(', '));
        const { error } = await sb.from('PROPALE_BDC').insert(ins);
        if (error) { console.error('[propaleVO] INSERT error', error); throw error; }
        console.log('[propaleVO] INSERT OK, id =', newId);
        ST.P.id_propale_bdc = newId; ST.mode = 'update'; ST.P.status = 'draft';
        setVar(VAR_ID_PROPALE, newId);
        toast(root, 'Brouillon créé ✓');
        setTimeout(() => goPipe(), 1200);

      } else {
        const id = num(ST.P.id_propale_bdc);
        const upd = Object.assign({}, payload, { updated_at: now });

        if (intent === 'promote' && ST.P.status === 'propale') {
          const { data: mx, error: mxErr } = await sb.from('PROPALE_BDC').select('id_propale_bdc').order('id_propale_bdc',{ascending:false}).limit(1);
          if (mxErr) throw mxErr;
          const newId = ((mx && mx[0]) ? num(mx[0].id_propale_bdc) : 0) + 1;
          const dup = Object.assign({}, upd, { id_propale_bdc: newId, status: 'draft', Archived: false, id_user_creation: userId, created_at: now });
          const { error } = await sb.from('PROPALE_BDC').insert(dup);
          if (error) throw error;
          toast(root, 'Nouveau brouillon créé ✓');
          setTimeout(() => goPipe(), 1200);

        } else {
          console.log('[propaleVO] UPDATE id =', id);
          const { error } = await sb.from('PROPALE_BDC').update(upd).eq('id_propale_bdc', id);
          if (error) { console.error('[propaleVO] UPDATE error', error); throw error; }
          console.log('[propaleVO] UPDATE OK');
          if (intent === 'promote' && ST.P.status === 'draft') {
            const { error: e2 } = await sb.rpc('move_propale', { p_id: id, p_target_state: 'propale', p_payload: {} });
            if (e2) throw e2;
            ST.P.status = 'propale';
            toast(root, 'Proposition validée ✓');
          } else {
            toast(root, 'Enregistré ✓');
          }
          setTimeout(() => goPipe(), 1200);
        }
      }
      refreshTotals(root);

    } catch(e) {
      console.error('[propaleVO] save ERREUR', e);
      // Affiche l'erreur dans un bandeau rouge en haut du récap
      const sumB = root.querySelector('#pv-sum');
      if (sumB) {
        const errDiv = fdoc().createElement('div');
        errDiv.style.cssText = 'background:#fcebeb;color:#e24b4a;border:1px solid #f5a5a5;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:700;margin-bottom:10px';
        errDiv.textContent = 'Erreur : ' + (e.message || String(e));
        sumB.prepend(errDiv);
        setTimeout(() => { if (errDiv.parentNode) errDiv.parentNode.removeChild(errDiv); }, 8000);
      }
    } finally {
      ST.saving = false; refreshTotals(root);
    }
  }

  function goPipe() {
    if (inEditor()) {
      try { wwLib.wwApp.goTo(PAGE_PIPE); return; } catch(e) {}
    }
    try { wwLib.goTo(PATH_PIPE); return; } catch(e) {}
    try { wwLib.wwApp.goTo(PAGE_PIPE); } catch(e) {}
  }

  function toast(root, msg) {
    let t = fdoc().querySelector('.pv-toast');
    if (!t) { t = fdoc().createElement('div'); t.className='pv-toast'; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#3a8a76;color:#fff;padding:11px 20px;border-radius:9px;font:700 13px "Nunito Sans",sans-serif;z-index:9999;transition:opacity .3s;white-space:nowrap'; fdoc().body.appendChild(t); }
    t.style.background='#3a8a76'; t.textContent=msg; t.style.opacity='1';
    clearTimeout(t._to); t._to=setTimeout(()=>{ t.style.opacity='0'; }, 2800);
  }

  function showErr(root, msg) {
    let e = root.querySelector('.pv-err');
    if (!e) { e=fdoc().createElement('div'); e.className='pv-err'; root.querySelector('.pv-sum-b').prepend(e); }
    e.textContent = msg;
    setTimeout(()=>{ if(e.parentNode) e.parentNode.removeChild(e); }, 6000);
  }

  /* ========================== BOOT ========================== */
  let booted = false;
  async function boot(rootId, mode) {
    if (booted) return;
    booted = true;
    ST.mode   = mode;
    ST.rootId = rootId;
    const root = __anchor;   // fourni par le loader
    root.innerHTML = '<div style="padding:40px;text-align:center;color:#7a98c5;font-family:\'Nunito Sans\',sans-serif;font-size:14px">Chargement…</div>';
    try {
      await loadData();
      render(root);
    } catch(e) {
      console.error('[propaleVO] boot error', e);
      root.innerHTML = `<div style="padding:40px;color:#e24b4a;font-family:sans-serif;font-size:13px"><strong>Erreur de chargement</strong><br>${esc(e.message||String(e))}</div>`;
    }
  }

  // Démarrage : le mode n'est plus déduit du ROOT_ID présent dans le DOM (le
  // loader fournit UNE ancre). Il vient de data-od-props sur l'ancre :
  //   <div data-od-module="propale-vo" data-od-props='{"mode":"create"}'></div>
  // avec repli sur l'URL si la prop est absente.
  let __mode = (ctx.props && ctx.props.mode) || '';
  if (__mode !== 'create' && __mode !== 'update') {
    __mode = /update/i.test(location.pathname) ? 'update' : 'create';
  }
  const __rootId = __mode === 'update' ? 'propale-vo-update' : 'propale-vo-create';
  __anchor.id = __rootId;   // conserve le ciblage CSS existant
  await boot(__rootId, __mode);
  }
});