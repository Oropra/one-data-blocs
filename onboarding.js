// ============================================================================
//  ONBOARDING & FLOTTE — module One Data (OD.define)  v1
//  Suivi de déploiement client. Lecture/écriture dans la base OROPRA
//  (v_onboarding, onboarding_step) via ctx.supabase — aucune plomberie.
//
//  Parti pris : l'écran ne se lit pas, il PARLE.
//   • « À toi de jouer »      = 1re étape non faite dont TU es responsable,
//                               bloquants en tête. C'est ta liste du matin.
//   • « Tu attends le client » = séparé, avec l'âge de la demande. Ce ne sont
//                               pas tes tâches : ce sont des relances.
//   • Les pistes               = 11 segments par client, cliquables, dépliables.
//   • La dérive                = lue depuis fleet_snapshot (alimentée côté
//                               serveur : la clé du control plane ne va jamais
//                               dans le navigateur).
// ============================================================================
OD.define('onboarding', {
  async mount(__anchor, ctx) {
    // ── Garde tenant ────────────────────────────────────────────────────
    // La coquille WeWeb est PARTAGÉE : la route /onboarding existe chez tous les
    // clients. Ce module est un outil interne — il ne doit se monter que chez
    // OROPRA. Sans cette garde, un utilisateur d'un autre tenant qui devine
    // l'URL verrait la page (ses tables onboarding_* seraient vides, mais la
    // page n'a rien à faire chez lui).
    if (!ctx.tenant || ctx.tenant.slug !== 'oropra') {
      __anchor.innerHTML = '';
      return;
    }

    __anchor.id = 'onb-root';
    const doc = __anchor.ownerDocument || document;
    const sb  = ctx.supabase;

    const S = { rows: [], fleet: [], open: null, loading: true, err: null };

    const STATUTS = ['a_faire', 'en_cours', 'fait', 'sans_objet'];
    const LIB = { a_faire:'à faire', en_cours:'en cours', fait:'fait', sans_objet:'sans objet' };
    const COL = { fait:'#5DCAA5', en_cours:'#EF9F27', a_faire:'#D3D1C7', sans_objet:'#F1EFE8' };
    const esc = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                              .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // ── données ────────────────────────────────────────────────────────────
    async function load() {
      S.loading = true; render();
      try {
        const { data, error } = await sb.from('v_onboarding')
          .select('*').order('slug').order('phase').order('ordre');
        if (error) throw error;
        S.rows = data || [];
        try {
          const f = await sb.from('fleet_snapshot').select('*').order('module_key');
          S.fleet = f.data || [];
        } catch (e) { S.fleet = []; }
        S.err = null;
      } catch (e) { S.err = e.message || String(e); }
      S.loading = false; render();
    }

    const clients = () => {
      const m = new Map();
      S.rows.forEach(r => {
        if (!m.has(r.slug)) m.set(r.slug, { slug:r.slug, nom:r.nom, statut:r.client_statut, steps:[] });
        m.get(r.slug).steps.push(r);
      });
      return [...m.values()];
    };
    const phases = c => {
      const m = new Map();
      c.steps.forEach(s => { if (!m.has(s.phase)) m.set(s.phase, []); m.get(s.phase).push(s); });
      return [...m.entries()].map(([p, list]) => ({
        phase: p,
        tete: list.find(s => s.ordre === 0) || list[0],
        sous: list.filter(s => s.ordre > 0),
      })).sort((a,b) => a.phase - b.phase);
    };
    // Une phase est "faite" si toutes ses lignes le sont (ou sans objet).
    const etatPhase = ph => {
      const all = [ph.tete, ...ph.sous];
      const reste = all.filter(s => s.statut !== 'fait' && s.statut !== 'sans_objet');
      if (!reste.length) return 'fait';
      if (reste.some(s => s.bloquant && s.statut === 'a_faire')) return 'bloquant';
      if (all.some(s => s.statut === 'en_cours')) return 'en_cours';
      return 'a_faire';
    };

    // ── écriture ───────────────────────────────────────────────────────────
    async function cycle(id) {
      const r = S.rows.find(x => x.step_id === id); if (!r) return;
      const next = STATUTS[(STATUTS.indexOf(r.statut) + 1) % STATUTS.length];
      r.statut = next; render();               // optimiste
      const { error } = await sb.from('onboarding_step').update({ statut: next }).eq('id', id);
      if (error) { alert('Enregistrement KO : ' + error.message); }
      await load();                            // le trigger a posé les dates
    }
    async function saveNote(id, txt) {
      const { error } = await sb.from('onboarding_step').update({ note: txt || null }).eq('id', id);
      if (error) alert('Note non enregistrée : ' + error.message);
      const r = S.rows.find(x => x.step_id === id); if (r) r.note = txt;
    }

    // ── ce que l'écran calcule pour toi ────────────────────────────────────
    function mesActions() {
      const out = [];
      clients().filter(c => c.statut === 'en_cours').forEach(c => {
        const cand = c.steps
          .filter(s => s.responsable === 'moi' && s.statut !== 'fait' && s.statut !== 'sans_objet')
          .sort((a,b) => (b.bloquant - a.bloquant) || (a.phase - b.phase) || (a.ordre - b.ordre));
        if (cand[0]) {
          const bloque = c.steps.filter(s => s.phase > cand[0].phase && s.statut === 'a_faire').length;
          out.push({ ...cand[0], nom: c.nom, derriere: cand[0].bloquant ? bloque : 0 });
        }
      });
      return out.sort((a,b) => (b.bloquant - a.bloquant) || (b.derriere - a.derriere));
    }
    const relances = () => S.rows
      .filter(s => s.responsable === 'client' && s.statut === 'en_cours')
      .sort((a,b) => (b.attente_jours || 0) - (a.attente_jours || 0));

    // ── rendu ──────────────────────────────────────────────────────────────
    function css() {
      if (doc.getElementById('onb-css')) return;
      const st = doc.createElement('style'); st.id = 'onb-css';
      st.textContent = `
      #onb-root{font-family:"Nunito Sans",system-ui,sans-serif;color:#1c2b45;padding:20px;max-width:1080px;margin:0 auto}
      .onb-h{font-size:17px;font-weight:700;margin:26px 0 10px;display:flex;align-items:baseline;gap:9px}
      .onb-h span{font-size:13px;font-weight:400;color:#7a8aa3}
      .onb-card{background:#f5f7fb;border-radius:10px;padding:2px 14px}
      .onb-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #e3eaf3}
      .onb-row:last-child{border-bottom:none}
      .onb-t{font-size:14px;font-weight:600}
      .onb-s{font-size:12px;color:#7a8aa3}
      .onb-chip{font-size:11px;padding:2px 8px;border-radius:5px;white-space:nowrap;font-weight:600}
      .onb-rail{display:flex;gap:3px;flex:1}
      .onb-seg{height:26px;flex:1;border-radius:3px;cursor:pointer;transition:transform .1s}
      .onb-seg:hover{transform:translateY(-2px)}
      .onb-seg.on{outline:2px solid #2a5ea9;outline-offset:1px}
      .onb-line{display:flex;align-items:center;gap:12px;margin-bottom:11px}
      .onb-nom{width:130px;font-size:13px;font-weight:700;cursor:pointer}
      .onb-pct{width:58px;text-align:right;font-size:12px;color:#7a8aa3}
      .onb-det{background:#fff;border:1px solid #e3eaf3;border-radius:10px;padding:14px 16px;margin:0 0 16px}
      .onb-sub{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f1f4f9}
      .onb-sub:last-child{border-bottom:none}
      .onb-dot{width:11px;height:11px;border-radius:3px;margin-top:4px;cursor:pointer;flex-shrink:0}
      .onb-note{width:100%;border:1px solid #e3eaf3;border-radius:6px;padding:5px 8px;font-size:12px;
                font-family:inherit;margin-top:5px;resize:vertical;min-height:28px}
      .onb-b{background:#fdecec;color:#c0392b}
      .onb-w{background:#fdf3e0;color:#9a6700}
      .onb-g{background:#e6f6f0;color:#0f6e56}
      .onb-n{background:#eef2f7;color:#5a6a80}
      .onb-leg{display:flex;gap:14px;font-size:11px;color:#7a8aa3;flex-wrap:wrap;margin:2px 0 22px}
      `;
      (doc.head || doc.documentElement).appendChild(st);
    }

    function vRow(icon, titre, sous, chip, cls) {
      return `<div class="onb-row"><div style="flex:1">
        <div class="onb-t">${titre}</div><div class="onb-s">${sous}</div></div>
        ${chip ? `<span class="onb-chip ${cls}">${chip}</span>` : ''}</div>`;
    }

    function vDetail(c) {
      const ph = phases(c).find(p => p.phase === S.open.phase);
      if (!ph) return '';
      const ligne = s => {
        const resp = s.responsable === 'client' ? '<span class="onb-chip onb-n">client</span>'
                   : s.responsable === 'auto'   ? '<span class="onb-chip onb-n">auto</span>' : '';
        const bl = s.bloquant ? '<span class="onb-chip onb-b">bloquant</span>' : '';
        const dt = s.fait_le ? ' · fait le ' + new Date(s.fait_le).toLocaleDateString('fr-FR')
                 : (s.attente_jours != null ? ` · demandé il y a ${s.attente_jours} j` : '');
        return `<div class="onb-sub">
          <div class="onb-dot" style="background:${COL[s.statut]}" data-cycle="${s.step_id}"
               title="${LIB[s.statut]} — cliquer pour changer"></div>
          <div style="flex:1">
            <div style="font-size:13px;${s.statut==='fait'?'color:#7a8aa3;text-decoration:line-through':''}">
              ${esc(s.libelle)} ${resp} ${bl}</div>
            ${s.aide ? `<div class="onb-s">${esc(s.aide)}</div>` : ''}
            <div class="onb-s">${LIB[s.statut]}${dt}</div>
            <textarea class="onb-note" data-note="${s.step_id}" rows="1"
              placeholder="note…">${esc(s.note || '')}</textarea>
          </div></div>`;
      };
      return `<div class="onb-det">
        <div style="font-size:14px;font-weight:700;margin-bottom:10px">
          Étape ${ph.phase} — ${esc(ph.tete.libelle)}</div>
        ${ligne(ph.tete)}${ph.sous.map(ligne).join('')}</div>`;
    }

    function render() {
      css();
      if (S.loading) { __anchor.innerHTML = '<div style="padding:40px;color:#7a9cc4">Chargement…</div>'; return; }
      if (S.err) { __anchor.innerHTML = `<div style="padding:40px;color:#c0392b">Erreur : ${esc(S.err)}</div>`; return; }

      const acts = mesActions(), rel = relances(), cs = clients();

      const hActs = acts.length
        ? acts.map(a => vRow('', `${esc(a.nom)} · étape ${a.phase} — ${esc(a.libelle)}`,
            (a.bloquant ? 'bloquant' : 'à faire') + (a.derriere ? ` · ${a.derriere} étapes derrière` : '')
              + (a.aide ? ' · ' + esc(a.aide) : ''),
            a.bloquant ? 'bloquant' : 'à faire', a.bloquant ? 'onb-b' : 'onb-w')).join('')
        : '<div class="onb-row"><div class="onb-s">Rien ne t\'attend. </div></div>';

      const hRel = rel.length
        ? rel.map(r => vRow('', `${esc(r.nom)} · étape ${r.phase} — ${esc(r.libelle)}`,
            'demandé il y a ' + (r.attente_jours ?? 0) + ' jours',
            (r.attente_jours ?? 0) + ' j', (r.attente_jours ?? 0) > 7 ? 'onb-b' : 'onb-n')).join('')
        : '<div class="onb-row"><div class="onb-s">Aucune relance en cours.</div></div>';

      const hRails = cs.map(c => {
        const ph = phases(c);
        const faites = ph.filter(p => etatPhase(p) === 'fait').length;
        const segs = ph.map(p => {
          const e = etatPhase(p);
          const bg = e === 'fait' ? '#5DCAA5' : e === 'bloquant' ? '#E24B4A'
                   : e === 'en_cours' ? '#EF9F27' : '#D3D1C7';
          const dash = p.tete.responsable === 'client' ? ';border:1px dashed #9aa7b8' : '';
          const on = S.open && S.open.slug === c.slug && S.open.phase === p.phase ? ' on' : '';
          return `<div class="onb-seg${on}" style="background:${bg}${dash}"
                    data-open="${c.slug}|${p.phase}" title="Étape ${p.phase} — ${esc(p.tete.libelle)}"></div>`;
        }).join('');
        const lbl = c.statut === 'en_prod' ? 'en prod' : `${faites} / ${ph.length}`;
        const det = S.open && S.open.slug === c.slug ? vDetail(c) : '';
        return `<div class="onb-line"><span class="onb-nom" data-cli="${c.slug}">${esc(c.nom)}</span>
          <div class="onb-rail">${segs}</div><span class="onb-pct">${lbl}</span></div>${det}`;
      }).join('');

      const dot = (bg, txt) => `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${bg};margin-right:4px"></span>${txt}</span>`;

      const hFleet = S.fleet.length
        ? S.fleet.map(f => `<div class="onb-row"><div style="flex:1"><div class="onb-t">${esc(f.module_key)}</div>
            <div class="onb-s">défaut ${esc(f.version_defaut || '?')}</div></div>
            ${f.epingles ? `<span class="onb-chip onb-w">${esc(f.epingles)}</span>`
                         : '<span class="onb-chip onb-g">tous à jour</span>'}</div>`).join('')
        : `<div class="onb-row"><div class="onb-s">Instantané absent — lancer la synchro de flotte
             (edge function <code>fleet-sync</code>).</div></div>`;

      __anchor.innerHTML = `
        <div class="onb-h">À toi de jouer <span>${acts.length} action${acts.length>1?'s':''}</span></div>
        <div class="onb-card">${hActs}</div>
        <div class="onb-h">Tu attends le client <span>${rel.length} relance${rel.length>1?'s':''}</span></div>
        <div class="onb-card">${hRel}</div>
        <div class="onb-h">Pistes de lancement <span>clique un segment pour déplier</span></div>
        ${hRails}
        <div class="onb-leg">${dot('#5DCAA5','fait')}${dot('#EF9F27','en cours')}${dot('#E24B4A','bloquant')}${dot('#D3D1C7','à faire')}
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1px dashed #9aa7b8;margin-right:4px"></span>chez le client</span></div>
        <div class="onb-h">Dérive de la flotte</div>
        <div class="onb-card">${hFleet}</div>`;

      bind();
    }

    function bind() {
      __anchor.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => {
        const [slug, p] = el.getAttribute('data-open').split('|');
        const same = S.open && S.open.slug === slug && S.open.phase === Number(p);
        S.open = same ? null : { slug, phase: Number(p) };
        render();
      }));
      __anchor.querySelectorAll('[data-cli]').forEach(el => el.addEventListener('click', () => {
        const slug = el.getAttribute('data-cli');
        S.open = (S.open && S.open.slug === slug) ? null : { slug, phase: 0 };
        render();
      }));
      __anchor.querySelectorAll('[data-cycle]').forEach(el => el.addEventListener('click', () =>
        cycle(Number(el.getAttribute('data-cycle')))));
      __anchor.querySelectorAll('[data-note]').forEach(el => {
        el.addEventListener('blur', () => saveNote(Number(el.getAttribute('data-note')), el.value.trim()));
        el.addEventListener('click', ev => ev.stopPropagation());
      });
    }

    await load();
  }
});
