// Zonacalda — regia: i numeri della serata per l'organizzatore. Solo lettura, si aggiorna da sola ogni 15 secondi.
(() => {
  const $ = (id) => document.getElementById(id);
  let pin = '';
  try { pin = sessionStorage.getItem('zc-regia') || ''; } catch (e) { /* niente */ }
  let giro = 0, falliti = 0;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const maiuscole = (s) => String(s || '').toLocaleLowerCase('it').replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('it'));
  const metti = (id, v) => { $(id).textContent = v; };

  const mostra = (r) => {
    const L = r.lista, B = r.backstage, S = r.staff;
    metti('agg', r.aggiornato); metti('dentro', r.dentro); metti('capienza', r.capienza);
    $('riempi').style.width = Math.min(100, (r.dentro / r.capienza) * 100) + '%';
    metti('l-tot', L.totale + ' registrati');
    metti('l-entrati', L.entrato); metti('l-attesi', L.confermato); metti('l-invitati', L.invitato);
    metti('l-inlista', L['in lista']); metti('l-dainvitare', L['da invitare']); metti('l-no', L.rifiutato + L.scaduto);
    metti('b-tot', (B.totale - B.annullato) + ' / ' + B.posti + ' posti');
    metti('b-entrati', B.entrato); metti('b-attesi', B.confermato); metti('b-richieste', B.richiesta);
    metti('b-pagati', B.pagati); metti('b-dapagare', B.daPagare);
    metti('s-tot', S.totale + ' in lista' + (S.aMano ? ' · ' + S.aMano + ' a mano' : ''));
    metti('s-entrati', S.entrato + S.aMano); metti('s-attesi', S.registrato); metti('s-noreg', S.abilitato);
    const P = r.pubblico, anni = (v) => (v === null || v === undefined ? '–' : String(v).replace('.', ','));
    if (P) {
      metti('p-donne', P.donne); metti('p-uomini', P.uomini); metti('p-eta-d', anni(P.etaDonne)); metti('p-eta-u', anni(P.etaUomini)); metti('p-eta', anni(P.etaTutti));
      metti('p-incerti', (P.incerti ? P.incerti + ' con un nome che non dice se uomo o donna (contati solo nell\'età di tutti). ' : '') + 'uomo o donna è una stima dal nome.');
    }
    $('ultimi').innerHTML = r.ultimi.length
      ? r.ultimi.map((u) => `<li><time>${esc(u.ora)}</time><span>${esc(maiuscole(u.chi))}</span><em class="${esc(u.tipo)}">${esc(u.tipo)}</em></li>`).join('')
      : '<li>nessuno, per ora.</li>';
  };

  const aggiorna = async () => {
    const r = await zcApi({ azione: 'regia', pin });
    if (r.ok) { falliti = 0; mostra(r); $('stato').className = 'stato'; metti('stato', 'si aggiorna da sola ogni 15 secondi.'); }
    else if (r.errore === 'pin' || r.errore === 'bloccato') { esci(); }
    else { falliti++; $('stato').className = 'stato male'; metti('stato', 'nessuna connessione: i numeri sono quelli delle ' + $('agg').textContent + '. riprovo…'); }
    return r;
  };

  // ------------------------------------------------ backstage: elenco e pagamenti
  let bk = [], chiedi = '';
  const disegnaBk = () => {
    const q = $('q-bk').value.trim().toLowerCase();
    const righe = bk.map((p, i) => ({ p, i })).filter(({ p }) => !q || (p.nome + ' ' + p.cognome + ' ' + p.cognome + ' ' + p.nome).toLowerCase().includes(q));
    $('lista-bk').innerHTML = righe.length ? righe.map(({ p, i }) => {
      const info = `prenotato ${esc(p.prenotato)} · ${esc(p.stato)}${p.entrato ? ' alle ' + esc(p.entrato) : ''}`;
      const b = chiedi === p.id
        ? `<button class="spunta chiedi" data-id="${esc(p.id)}" data-ok="1">${p.pagato ? 'togliere? ok' : 'pagato? ok'}</button>`
        : p.pagato ? `<button class="spunta si" data-id="${esc(p.id)}">✓ pagato</button>`
        : `<button class="spunta" data-id="${esc(p.id)}">segna pagato</button>`;
      return `<li><span class="num">${i + 1}</span><div class="chi"><b>${esc(maiuscole(p.nome + ' ' + p.cognome))}</b><small class="${esc(p.stato)}">${info}</small></div>${b}</li>`;
    }).join('') : '<li>nessuno.</li>';
  };
  const caricaBk = async () => {
    const r = await zcApi({ azione: 'regia', pin, op: 'backstage' });
    if (r.ok) { bk = r.persone; disegnaBk(); } else if (!bk.length) $('lista-bk').innerHTML = '<li>nessuna connessione. riprova.</li>';
  };
  let timerChiedi = 0;
  $('lista-bk').addEventListener('click', async (e) => {
    const b = e.target.closest('.spunta');
    if (!b) return;
    const id = b.dataset.id, p = bk.find((x) => x.id === id);
    if (!b.dataset.ok) {                                  // primo tocco: chiede conferma
      chiedi = id; disegnaBk();
      clearTimeout(timerChiedi); timerChiedi = setTimeout(() => { chiedi = ''; disegnaBk(); }, 5000);
      return;
    }
    clearTimeout(timerChiedi); chiedi = '';
    b.disabled = true; b.textContent = 'salvo…';
    const r = await zcApi({ azione: 'regia', pin, op: 'pagato', id, si: !p.pagato });
    if (r.ok) { bk = r.persone; disegnaBk(); aggiorna(); }
    else { disegnaBk(); alert('non salvato: nessuna connessione. riprova.'); }
  });
  $('q-bk').addEventListener('input', disegnaBk);
  const apriBk = () => { $('pannello').hidden = true; $('vista-bk').hidden = false; window.scrollTo(0, 0); caricaBk(); };
  $('apri-bk').addEventListener('click', apriBk);
  $('apri-bk').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriBk(); } });
  $('chiudi-bk').addEventListener('click', () => { $('vista-bk').hidden = true; $('pannello').hidden = false; aggiorna(); });

  const entra = async () => {
    const r = await aggiorna();
    if (!r.ok) {
      metti('err-pin', r.errore === 'bloccato' ? 'troppi tentativi. riprova tra 10 minuti.'
        : r.errore === 'pin' ? 'PIN sbagliato.' : r.errore === 'non_attivo' ? 'sistema non ancora collegato.' : 'nessuna connessione. riprova.');
      return;
    }
    try { sessionStorage.setItem('zc-regia', pin); } catch (e) { /* niente */ }
    $('accesso').hidden = true; $('pannello').hidden = false;
    clearInterval(giro); giro = setInterval(aggiorna, 15000);
  };
  const esci = () => {
    clearInterval(giro);
    try { sessionStorage.removeItem('zc-regia'); } catch (e) { /* niente */ }
    pin = ''; $('pannello').hidden = true; $('vista-bk').hidden = true; $('accesso').hidden = false;
  };

  $('f-pin').addEventListener('submit', (e) => { e.preventDefault(); pin = e.target.pin.value.trim(); metti('err-pin', ''); entra(); });
  $('esci').addEventListener('click', (e) => { e.preventDefault(); esci(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!$('pannello').hidden) aggiorna();
    if (!$('vista-bk').hidden) caricaBk();
  });
  if (pin) entra();
})();
