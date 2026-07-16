// ============================================================================
//  IMPORT BDC VN — module One Data (OD.define)  v1
//  Rendu dans __anchor ; client via ctx.supabase ; attente d'ancre + garde
//  "bdcvnMounted" retirés (le loader possède le cycle de vie).
//  Fonction interne mount() renommée mountApp() (clarté vs le mount du module).
//  Navigation éditeur/prod déjà correcte dans ce bloc (inEditor + LANG_PREFIX).
// ============================================================================
/* ============================================================================
 * Import BDC VN — page WeWeb (Execute JavaScript, on page load)
 * ----------------------------------------------------------------------------
 * Embed HTML requis : <div id="bdcvn-app"></div>
 * Bootstrap résilient : attend que #bdcvn-app soit monté (corrige la page
 * blanche en prod, où le workflow s'exécute avant l'embed).
 *
 * Résolution client déléguée à oropra-client-search via la variable de
 * contexte bdcvn_ctx (aller-retour entre les deux pages).
 * ==========================================================================*/
OD.define('bdc-vn', {
  async mount(__anchor, ctx) {
  __anchor.id = 'bdcvn-app';
  // -------- CONFIG ---------------------------------------------------------
  const CTX_VAR_ID = "76d470a8-bc86-490b-be55-c1c6b95d5ddf";
  const CLIENT_SEARCH_PATH = "/client";
  const CLIENT_SEARCH_PAGE_ID = "f5b60fe2-bc14-4b3e-ba84-82ddfa11248c";
  const LANG_PREFIX = "/fr";
  // -------------------------------------------------------------------------

  const doc = __anchor.ownerDocument || document;
  function getRoot() { return __anchor; }
  function inEditor() { try { return window.self !== window.top; } catch (e) { return true; } }
  function readCtx() { try { return wwLib.wwVariable.getValue(CTX_VAR_ID) || null; } catch (e) { return null; } }
  function writeCtx(v) { try { wwLib.wwVariable.updateValue(CTX_VAR_ID, v); } catch (e) { } }
  function goToSearch() {
    if (inEditor()) {
      try { wwLib.wwApp.goTo(CLIENT_SEARCH_PAGE_ID); return; } catch (e) { }
      try { wwLib.goTo(CLIENT_SEARCH_PAGE_ID); return; } catch (e) { }
      return;
    }
    const href = LANG_PREFIX + CLIENT_SEARCH_PATH;
    try { wwLib.goTo(href); return; } catch (e) { }
    try { const w = (wwLib.getFrontWindow && wwLib.getFrontWindow()) || window; w.location.href = href; } catch (e) { }
  }

  // Bootstrap : le loader fournit __anchor et possède le cycle de vie (re-montage
  // SPA compris). L'attente d'ancre est retirée, ainsi que le garde-fou
  // "bdcvnMounted" — il empêcherait le re-rendu au retour sur la page.
  await mountApp(__anchor);

  // ========================================================================
  async function mountApp(root) {
    const sb = ctx.supabase;
    const BUCKET = "bdc-imports";
    const FN_EXTRACT = "import-bdc-vn-extract";

    function viewerId() {
      try {
        let d = ((wwLib.getFrontWindow && wwLib.getFrontWindow()) || window).oropraUser;
        if (Array.isArray(d)) d = d[0];
        return (d && d.ID_User) != null ? d.ID_User : null;
      } catch (e) { return null; }
    }

    // -------------------------------------------------------------- design ----
    const C = {
      blue: "#2A5EA9", green: "#53BDA7", yellow: "#FEC124", orange: "#fac055",
      red: "#E24B4A", redSoft: "#d97070", lightBlue: "#acc5e4",
      bg: "#F5F8FC", border: "#ece9e1", ink: "#3a4b5e", inkSoft: "#6b7a8d",
      greenBg: "#e9f7f3",
    };

    function injectStyles() {
      if (doc.getElementById("bdcvn-styles")) return;
      const s = doc.createElement("style");
      s.id = "bdcvn-styles";
      s.textContent = `
    #bdcvn-app .bdcvn{font-family:'Nunito Sans',system-ui,sans-serif;color:${C.ink};
      background:${C.bg};min-height:100%;padding:28px 24px 60px;box-sizing:border-box}
    #bdcvn-app .bdcvn *{box-sizing:border-box}
    #bdcvn-app .bdcvn h1{font-size:24px;font-weight:800;margin:0 0 4px;color:${C.blue};
      display:flex;align-items:center;gap:11px}
    #bdcvn-app .bdcvn h1::before{content:"";width:9px;height:24px;border-radius:4px;
      background:${C.green};display:inline-block}
    #bdcvn-app .bdcvn .sub{color:${C.inkSoft};font-size:14px;margin:0 0 22px;padding-left:20px}
    #bdcvn-app .bdcvn .card{background:#fff;border:1px solid ${C.border};border-radius:16px;
      padding:20px;margin-bottom:18px;box-shadow:0 1px 2px rgba(43,58,79,.04)}
    #bdcvn-app .bdcvn .card.up{border-top:3px solid ${C.green}}
    #bdcvn-app .bdcvn .drop{border:2px dashed ${C.lightBlue};border-radius:14px;padding:26px;
      text-align:center;transition:.15s;cursor:pointer;background:linear-gradient(180deg,#fbfefd,#f4fbf9)}
    #bdcvn-app .bdcvn .drop.hot{border-color:${C.green};background:#eaf7f3}
    #bdcvn-app .bdcvn .drop-ico{width:46px;height:46px;border-radius:50%;margin:0 auto 12px;
      background:${C.greenBg};display:flex;align-items:center;justify-content:center}
    #bdcvn-app .bdcvn .drop-ico svg{stroke:${C.green}}
    #bdcvn-app .bdcvn .drop .big{font-size:15px;font-weight:700;color:${C.blue}}
    #bdcvn-app .bdcvn .drop .hint{font-size:12.5px;color:${C.inkSoft};margin-top:4px}
    #bdcvn-app .bdcvn .btn{border:none;border-radius:10px;padding:9px 16px;font-weight:700;
      font-size:13.5px;cursor:pointer;font-family:inherit;transition:.12s;line-height:1}
    #bdcvn-app .bdcvn .btn:disabled{opacity:.5;cursor:default}
    #bdcvn-app .bdcvn .btn-primary{background:${C.blue};color:#fff}
    #bdcvn-app .bdcvn .btn-primary:hover:not(:disabled){filter:brightness(1.07)}
    #bdcvn-app .bdcvn .btn-green{background:${C.green};color:#fff}
    #bdcvn-app .bdcvn .btn-ghost{background:#fff;color:${C.inkSoft};border:1px solid ${C.border}}
    #bdcvn-app .bdcvn .btn-danger{background:#fff;color:${C.redSoft};border:1px solid #f0d9d9}
    #bdcvn-app .bdcvn .btn-sm{padding:6px 11px;font-size:12.5px}
    #bdcvn-app .bdcvn .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    #bdcvn-app .bdcvn .chip{border:1px solid ${C.border};background:#fff;border-radius:999px;
      padding:6px 14px;font-size:13px;font-weight:700;color:${C.inkSoft};cursor:pointer}
    #bdcvn-app .bdcvn .chip.on{background:${C.blue};color:#fff;border-color:${C.blue}}
    #bdcvn-app .bdcvn .chip .n{opacity:.7;font-weight:600;margin-left:5px}
    #bdcvn-app .bdcvn .spacer{flex:1}
    #bdcvn-app .bdcvn .imp{border:1px solid ${C.border};border-radius:14px;background:#fff;
      margin-bottom:12px;overflow:hidden}
    #bdcvn-app .bdcvn .imp-head{display:flex;align-items:center;gap:12px;padding:15px 18px;cursor:pointer}
    #bdcvn-app .bdcvn .imp-head:hover{background:#fbfdff}
    #bdcvn-app .bdcvn .imp-title{font-weight:800;font-size:15px}
    #bdcvn-app .bdcvn .imp-meta{color:${C.inkSoft};font-size:12.5px}
    #bdcvn-app .bdcvn .badge{border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:800;
      letter-spacing:.2px;white-space:nowrap}
    #bdcvn-app .bdcvn .tag{border-radius:8px;padding:3px 9px;font-size:11px;font-weight:700;
      background:${C.bg};color:${C.inkSoft};border:1px solid ${C.border}}
    #bdcvn-app .bdcvn .imp-body{padding:0 18px 18px;border-top:1px solid ${C.border}}
    #bdcvn-app .bdcvn .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
      gap:12px;margin:16px 0}
    #bdcvn-app .bdcvn .kv{background:${C.bg};border-radius:10px;padding:10px 12px}
    #bdcvn-app .bdcvn .kv .k{font-size:11px;color:${C.inkSoft};font-weight:700;text-transform:uppercase;letter-spacing:.3px}
    #bdcvn-app .bdcvn .kv .v{font-size:14px;font-weight:700;margin-top:3px}
    #bdcvn-app .bdcvn table.lines{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
    #bdcvn-app .bdcvn table.lines th{text-align:left;color:${C.inkSoft};font-size:11px;
      text-transform:uppercase;letter-spacing:.3px;padding:6px 8px;border-bottom:1px solid ${C.border}}
    #bdcvn-app .bdcvn table.lines td{padding:7px 8px;border-bottom:1px solid ${C.bg}}
    #bdcvn-app .bdcvn td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
    #bdcvn-app .bdcvn .neg{color:${C.red}}
    #bdcvn-app .bdcvn .section-t{font-size:12px;font-weight:800;text-transform:uppercase;
      letter-spacing:.4px;color:${C.inkSoft};margin:16px 0 8px}
    #bdcvn-app .bdcvn .cand{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid ${C.border};
      border-radius:10px;margin-bottom:8px;cursor:pointer;background:#fff}
    #bdcvn-app .bdcvn .cand:hover{border-color:${C.lightBlue}}
    #bdcvn-app .bdcvn .cand.sel{border-color:${C.blue};background:#eef4fc}
    #bdcvn-app .bdcvn .cand .score{margin-left:auto;font-size:11.5px;font-weight:800;color:${C.green}}
    #bdcvn-app .bdcvn .note{display:inline-block;background:#fff6e8;color:#8a6d1f;border:1px solid #f6e2b8;
      border-radius:8px;padding:3px 9px;font-size:11.5px;font-weight:700;margin:0 6px 6px 0}
    #bdcvn-app .bdcvn .banner-ok{background:#e9f7f3;border:1px solid #bfe7dd;color:#1f6f5c;
      border-radius:12px;padding:12px 14px;font-weight:700;font-size:13.5px}
    #bdcvn-app .bdcvn .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #bdcvn-app .bdcvn .actions{display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid ${C.border}}
    #bdcvn-app .bdcvn .up-item{display:flex;align-items:center;gap:10px;font-size:13px;padding:8px 0;border-top:1px solid ${C.bg}}
    #bdcvn-app .bdcvn .spin{width:15px;height:15px;border:2px solid ${C.lightBlue};border-top-color:${C.blue};
      border-radius:50%;animation:bdcvnspin .7s linear infinite}
    @keyframes bdcvnspin{to{transform:rotate(360deg)}}
    #bdcvn-app .bdcvn .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);
      background:${C.ink};color:#fff;padding:11px 18px;border-radius:10px;font-size:13.5px;
      font-weight:700;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.18)}
    #bdcvn-app .bdcvn .empty{text-align:center;color:${C.inkSoft};padding:40px;font-size:14px}
    #bdcvn-app .bdcvn a.link{color:${C.blue};font-weight:700;cursor:pointer;text-decoration:none;font-size:13px}
    @media (max-width:640px){
      #bdcvn-app .bdcvn{padding:18px 12px 48px}
      #bdcvn-app .bdcvn h1{font-size:20px}
      #bdcvn-app .bdcvn .card{padding:15px}
      #bdcvn-app .bdcvn .imp-head{flex-wrap:wrap;gap:8px}
      #bdcvn-app .bdcvn .grid{grid-template-columns:1fr 1fr;gap:8px}
      #bdcvn-app .bdcvn .up-item{flex-wrap:wrap}
      #bdcvn-app .bdcvn .up-item .tag{margin-left:0!important}
      #bdcvn-app .bdcvn .toolbar{overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}
      #bdcvn-app .bdcvn .actions{flex-wrap:wrap}
      #bdcvn-app .bdcvn table.lines{font-size:12px}
    }
    `;
      doc.head.appendChild(s);
    }

    // ------------------------------------------------------------- helpers ----
    const state = { imports: [], names: {}, filter: "all", open: new Set(), pick: {} };

    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const eur = (n) => (n == null || n === "" || isNaN(+n)) ? "—" :
      (+n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    const sanitize = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

    function toast(msg) {
      const t = doc.createElement("div");
      t.className = "toast"; t.textContent = msg; root.appendChild(t);
      setTimeout(() => t.remove(), 2600);
    }

    const STAT = {
      extrait: { t: "Extrait", bg: "#eef1f6", c: C.inkSoft },
      a_valider: { t: "À valider", bg: "#fff3df", c: "#9a6a12" },
      valide: { t: "Prêt à valider", bg: "#e9f7f3", c: "#1f6f5c" },
      commit: { t: "BDC créé", bg: "#e7f0fb", c: C.blue },
      rejete: { t: "Rejeté", bg: "#fbeaea", c: C.red },
    };
    const badge = (st) => {
      const s = STAT[st] || STAT.extrait;
      return `<span class="badge" style="background:${s.bg};color:${s.c}">${s.t}</span>`;
    };

    // ------------------------------------------------------------- données ----
    async function loadImports() {
      const { data, error } = await sb.from("import_bdc_vn")
        .select("*").order("created_at", { ascending: false }).limit(100);
      if (error) { toast("Erreur chargement : " + error.message); return; }
      state.imports = data || [];
      const ids = [...new Set(state.imports.map((i) => i.id_client_retenu).filter(Boolean))];
      state.names = {};
      if (ids.length) {
        const { data: cs } = await sb.from("CLIENT")
          .select('"IDVu","NOM","PRENOM"').in("IDVu", ids.map(Number));
        (cs || []).forEach((c) => {
          state.names[String(c.IDVu)] = [c.NOM, c.PRENOM].filter(Boolean).join(" ");
        });
      }
    }

    // ------------------------------------------------------------- upload -----
    async function traiterFichier(file, listEl) {
      const item = doc.createElement("div");
      item.className = "up-item";
      item.innerHTML = `<span class="spin"></span><span>${esc(file.name)}</span>`;
      listEl.appendChild(item);
      try {
        const path = `imports/${Date.now()}_${sanitize(file.name)}`;
        const up = await sb.storage.from(BUCKET).upload(path, file, {
          upsert: true, contentType: "application/pdf",
        });
        if (up.error) throw up.error;
        const { data, error } = await sb.functions.invoke(FN_EXTRACT, {
          body: { fichier_path: path, bucket: BUCKET, id_user_creation: viewerId() },
        });
        if (error) throw error;
        if (!data || data.ok === false) throw new Error(data?.error || "Extraction échouée");
        const st = STAT[data.statut] || STAT.a_valider;
        item.innerHTML = `<span style="color:${C.green};font-weight:800">✓</span>
        <span>${esc(file.name)}</span>
        <span class="tag" style="margin-left:auto">${esc(data.numero_bdc || "sans n°")} · ${st.t}</span>`;
      } catch (e) {
        item.innerHTML = `<span style="color:${C.red};font-weight:800">✕</span>
        <span>${esc(file.name)}</span>
        <span class="tag" style="margin-left:auto;color:${C.red}">${esc(e.message || e)}</span>`;
      }
    }

    async function onFiles(files) {
      const listEl = root.querySelector("#bdcvn-uplist");
      listEl.style.display = "block";
      const arr = [...files].filter((f) => /pdf$/i.test(f.name) || f.type === "application/pdf");
      if (!arr.length) { toast("Déposez des fichiers PDF"); return; }
      for (const f of arr) await traiterFichier(f, listEl);
      await loadImports();
      renderList();
      toast("Import terminé");
    }

    // --------------------------------------------------------- résolution -----
    function openClientSearch(importId) {
      const imp = state.imports.find((i) => i.id === importId);
      const uf = (imp && imp.raw_json && imp.raw_json.utilisateur_final) || {};
      writeCtx({ importId, pickedIdvu: null, prefill: uf });
      goToSearch();
    }

    async function handleReturn() {
      const ctx = readCtx();
      if (!ctx || !ctx.importId || !ctx.pickedIdvu) return null;
      const importId = ctx.importId, idvu = String(ctx.pickedIdvu);
      writeCtx(null);
      const { error } = await sb.from("import_bdc_vn")
        .update({ id_client_retenu: idvu }).eq("id", importId);
      if (error) { toast("Erreur rattachement : " + error.message); return null; }
      state.pick[importId] = idvu;
      state.open.add(importId);
      return importId;
    }

    async function valider(importId) {
      const imp = state.imports.find((i) => i.id === importId);
      const idvu = state.pick[importId] || imp.id_client_retenu;
      if (!idvu) { toast("Choisissez un client"); return; }
      try {
        if (String(idvu) !== String(imp.id_client_retenu)) {
          const u = await sb.from("import_bdc_vn")
            .update({ id_client_retenu: String(idvu) }).eq("id", importId);
          if (u.error) throw u.error;
        }
        const { data, error } = await sb.rpc("commit_import_bdc_vn", { p_id: importId });
        if (error) throw error;
        if (data && data.ok === false) throw new Error(data.error);
        toast((data?.deja_commit ? "BDC déjà créé — propale #" : "BDC créé — propale #")
          + (data?.id_propale_bdc ?? ""));
        await loadImports(); renderList();
      } catch (e) { toast("Échec commit : " + (e.message || e)); }
    }

    async function rejeter(importId) {
      const imp = state.imports.find((i) => i.id === importId);
      if (imp && imp.id_propale_bdc) {
        toast("BDC déjà créé (propale #" + imp.id_propale_bdc + ") — rejet impossible");
        return;
      }
      const { error } = await sb.from("import_bdc_vn")
        .update({ statut: "rejete" }).eq("id", importId);
      if (error) { toast("Erreur : " + error.message); return; }
      await loadImports(); renderList();
    }

    // ------------------------------------------------------------- rendu ------
    function lignesTable(fin) {
      const L = (fin && fin.lignes) || [];
      if (!L.length) return "";
      const rows = L.map((l) => `<tr>
      <td>${esc(l.libelle)}</td>
      <td><span class="tag">${esc(l.categorie)}</span></td>
      <td class="num ${(+l.montant < 0) ? "neg" : ""}">${eur(l.montant)}</td></tr>`).join("");
      return `<table class="lines"><thead><tr><th>Libellé</th><th>Catégorie</th>
      <th style="text-align:right">Montant</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function reviewPanel(imp) {
      if (imp.statut === "commit") {
        return `<div class="banner-ok">BDC créé — propale #${esc(imp.id_propale_bdc)} ·
        client ${esc(state.names[String(imp.id_client_retenu)] || imp.id_client_retenu)}</div>`;
      }
      if (imp.statut === "rejete") {
        return `<div class="imp-meta">Import rejeté.</div>`;
      }
      const picked = state.pick[imp.id] || imp.id_client_retenu;
      const cands = imp.candidats_client || [];

      let client = "";
      if (picked) {
        client = `<div class="cand sel"><div><div style="font-weight:700">
        ${esc(state.names[String(picked)] || ("Client #" + picked))}</div>
        <div class="imp-meta">IDVu ${esc(picked)}</div></div>
        <a class="link" data-changeclient="${imp.id}" style="margin-left:auto">Changer</a></div>`;
      } else {
        const candHtml = cands.map((c) => `
        <div class="cand" data-pickclient="${imp.id}" data-idvu="${c.idvu}">
          <div><div style="font-weight:700">${esc(c.nom)} ${esc(c.prenom || "")}</div>
          <div class="imp-meta">SIRET ${esc(c.siret || "—")} · ${esc(c.ville || "")} · ${esc(c.methode)}</div></div>
          <span class="score">${Math.round((c.score || 0) * 100)}%</span></div>`).join("");
        client = `
        ${cands.length ? `<div style="margin-bottom:10px">${candHtml}</div>` : ""}
        <div class="row">
          <button class="btn btn-ghost btn-sm" data-openclientsearch="${imp.id}">
            Rechercher ou créer le client</button>
        </div>`;
      }

      const notes = ((imp.erreurs && imp.erreurs.match) || [])
        .map((n) => `<span class="note">${esc(n)}</span>`).join("");

      return `
      <div class="section-t">Client utilisateur final</div>
      ${client}
      ${notes ? `<div style="margin-top:10px">${notes}</div>` : ""}
      <div class="actions">
        <button class="btn btn-green" data-validate="${imp.id}" ${picked ? "" : "disabled"}>
          Valider et créer le BDC</button>
        <button class="btn btn-danger btn-sm" data-reject="${imp.id}">Rejeter</button>
      </div>`;
    }

    function impCard(imp) {
      const raw = imp.raw_json || {};
      const veh = raw.vehicule_neuf || {};
      const fin = raw.financier || {};
      const open = state.open.has(imp.id);
      const clientLabel = imp.id_client_retenu
        ? (state.names[String(imp.id_client_retenu)] || ("#" + imp.id_client_retenu))
        : ((imp.candidats_client || []).length ? "À trancher" : "À rapprocher");

      return `<div class="imp">
      <div class="imp-head" data-toggle="${imp.id}">
        <div style="flex:1">
          <div class="imp-title">${esc(imp.numero_bdc || "Sans numéro")}
            <span class="tag" style="margin-left:6px">${esc(imp.marque_reseau || "?")}</span></div>
          <div class="imp-meta">${esc(veh.designation || "")}</div>
        </div>
        ${badge(imp.statut)}
        <span style="color:${C.inkSoft};font-size:12px">${open ? "▲" : "▼"}</span>
      </div>
      ${open ? `<div class="imp-body">
        <div class="grid">
          <div class="kv"><div class="k">Prix total TTC</div><div class="v">${eur(fin.prix_total_ttc)}</div></div>
          <div class="kv"><div class="k">Acompte</div><div class="v">${eur(fin.acompte_verse)}</div></div>
          <div class="kv"><div class="k">Client</div><div class="v">${esc(clientLabel)}</div></div>
          <div class="kv"><div class="k">Reprise</div><div class="v">${raw.reprise ? eur(raw.reprise.valeur) : "—"}</div></div>
          <div class="kv"><div class="k">Financement</div><div class="v">${raw.financement ? esc((raw.financement.type || "").toUpperCase()) : "—"}</div></div>
          <div class="kv"><div class="k">Site résolu</div><div class="v">${imp.id_site ?? "—"}</div></div>
        </div>
        ${lignesTable(fin)}
        ${reviewPanel(imp)}
      </div>` : ""}
    </div>`;
    }

    function renderList() {
      const listEl = root.querySelector("#bdcvn-list");
      const counts = state.imports.reduce((a, i) => (a[i.statut] = (a[i.statut] || 0) + 1, a), {});
      root.querySelectorAll(".chip").forEach((ch) => {
        const f = ch.dataset.filter;
        ch.classList.toggle("on", f === state.filter);
        const n = f === "all" ? state.imports.length : (counts[f] || 0);
        ch.querySelector(".n").textContent = n;
      });
      let items = state.imports;
      if (state.filter !== "all") items = items.filter((i) => i.statut === state.filter);
      listEl.innerHTML = items.length
        ? items.map(impCard).join("")
        : `<div class="empty">Aucun import dans cette vue.</div>`;
    }

    function render() {
      injectStyles();
      root.innerHTML = `<div class="bdcvn">
      <h1>Import Bons de Commande VN</h1>
      <p class="sub">Déposez un ou plusieurs BDC PDF : extraction, rapprochement client et
        contrôles automatiques. Validez pour créer le bon de commande.</p>

      <div class="card up">
        <div class="drop" id="bdcvn-drop">
          <div class="drop-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 16V4M12 4l-5 5M12 4l5 5"/><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2"/></svg></div>
          <div class="big">Glissez vos PDF ici</div>
          <div class="hint">ou cliquez pour choisir des fichiers — plusieurs BDC acceptés</div>
        </div>
        <input type="file" id="bdcvn-file" accept="application/pdf" multiple style="display:none">
        <div id="bdcvn-uplist" style="display:none;margin-top:12px"></div>
      </div>

      <div class="toolbar">
        <div class="chip" data-filter="all">Tous<span class="n"></span></div>
        <div class="chip" data-filter="a_valider">À valider<span class="n"></span></div>
        <div class="chip" data-filter="valide">Prêts<span class="n"></span></div>
        <div class="chip" data-filter="commit">Créés<span class="n"></span></div>
        <div class="chip" data-filter="rejete">Rejetés<span class="n"></span></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="bdcvn-refresh">Rafraîchir</button>
      </div>

      <div id="bdcvn-list"></div>
    </div>`;
      wireStatic();
      renderList();
    }

    // ------------------------------------------------------------- events -----
    function wireStatic() {
      const drop = root.querySelector("#bdcvn-drop");
      const input = root.querySelector("#bdcvn-file");
      drop.addEventListener("click", () => input.click());
      input.addEventListener("change", (e) => { onFiles(e.target.files); input.value = ""; });
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
        e.preventDefault(); drop.classList.add("hot");
      }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
        e.preventDefault(); drop.classList.remove("hot");
      }));
      drop.addEventListener("drop", (e) => onFiles(e.dataTransfer.files));
      root.querySelector("#bdcvn-refresh").addEventListener("click", async () => {
        await loadImports(); renderList(); toast("Actualisé");
      });
      root.querySelectorAll(".chip").forEach((ch) => ch.addEventListener("click", () => {
        state.filter = ch.dataset.filter; renderList();
      }));
    }

    root.addEventListener("click", (e) => {
      const t = e.target.closest("[data-toggle],[data-pickclient],[data-changeclient],"
        + "[data-openclientsearch],[data-validate],[data-reject]");
      if (!t) return;
      if (t.dataset.toggle) {
        const id = t.dataset.toggle;
        state.open.has(id) ? state.open.delete(id) : state.open.add(id);
        renderList();
      } else if (t.dataset.pickclient) {
        state.pick[t.dataset.pickclient] = t.dataset.idvu;
        renderList();
      } else if (t.dataset.changeclient) {
        delete state.pick[t.dataset.changeclient];
        const imp = state.imports.find((i) => i.id === t.dataset.changeclient);
        if (imp) imp.id_client_retenu = null;
        renderList();
      } else if (t.dataset.openclientsearch) {
        openClientSearch(t.dataset.openclientsearch);
      } else if (t.dataset.validate) {
        valider(t.dataset.validate);
      } else if (t.dataset.reject) {
        rejeter(t.dataset.reject);
      }
    });

    // -------------------------------------------------------------- boot ------
    render();
    const returned = await handleReturn();
    await loadImports();
    if (returned) { state.open.add(returned); toast("Client rattaché"); }
    renderList();
  }
}
});
