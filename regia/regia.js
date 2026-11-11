// Zonacalda — regia: i numeri della serata per l'organizzatore. Solo lettura, si aggiorna da sola ogni 15 secondi.
(() => {
  const $ = (id) => document.getElementById(id);
  let pin = '';
  try { pin = sessionStorage.getItem('zc-regia') || ''; } catch (e) { /* niente */ }
  let giro = 0, falliti = 0, sessione = '';
  try { sessione = sessionStorage.getItem('zc-regia-s') || ''; } catch (e) { /* niente */ }
  const api = async (dati) => {
    const r = await zcApi({ azione: 'regia', pin, sessione, ...dati });
    if (r && r.sessione) { sessione = r.sessione; try { sessionStorage.setItem('zc-regia-s', sessione); } catch (e) { /* niente */ } }
    return r;
  };
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
    const r = await api({});
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
    const r = await api({ op: 'backstage' });
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
    const r = await api({ op: 'pagato', id, si: !p.pagato });
    if (r.ok) { bk = r.persone; disegnaBk(); aggiorna(); }
    else { disegnaBk(); alert('non salvato: nessuna connessione. riprova.'); }
  });
  $('q-bk').addEventListener('input', disegnaBk);
  const apriBk = () => { $('pannello').hidden = true; $('vista-bk').hidden = false; window.scrollTo(0, 0); caricaBk(); };
  $('apri-bk').addEventListener('click', apriBk);
  $('apri-bk').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriBk(); } });
  $('chiudi-bk').addEventListener('click', () => { $('vista-bk').hidden = true; $('pannello').hidden = false; aggiorna(); });

  // ------------------------------------------------ invii SMS dal telefono
  let invii = null, scheda = 'inviti', chiediInv = '', timerInv = 0;
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const linkSms = (tel, testo) => 'sms:' + tel.replace(/[^\d+]/g, '') + (iPhone ? '&' : '?') + 'body=' + encodeURIComponent(testo);
  const disegnaInvii = () => {
    if (!invii) return;
    const tutti = $('inv-tutti').checked;
    const elenco = invii[scheda] || [];
    const daFare = elenco.filter((x) => !x.mandato).length;
    metti('inv-conto', daFare + ' da mandare su ' + elenco.length);
    const righe = elenco.filter((x) => tutti || !x.mandato || chiediInv === x.id);
    $('lista-invii').innerHTML = righe.length ? righe.map((x) => {
      const k = x.tipo + ':' + x.id;
      const b = chiediInv === k ? `<button class="sms chiedi" data-k="${esc(k)}" data-ok="1">togliere? ok</button>`
        : x.mandato ? `<button class="sms fatto" data-k="${esc(k)}">✓ mandato</button>`
        : x.tel ? `<a class="sms" data-k="${esc(k)}" href="${esc(linkSms(x.tel, x.testo))}">manda SMS</a>` : '<span class="piccoli">manca il numero</span>';
      return `<li class="${x.mandato ? 'fatto' : ''}"><div class="chi"><b>${esc(maiuscole(x.nome))}</b><small>${esc(x.tel || '')}</small></div>${b}</li>`;
    }).join('') : '<li>' + (elenco.length ? 'tutti mandati. ✓' : 'nessuno.') + '</li>';
  };
  const caricaInvii = async () => {
    const r = await api({ op: 'invii' });
    if (r.ok) { invii = r.invii; disegnaInvii(); } else if (!invii) $('lista-invii').innerHTML = '<li>nessuna connessione. riprova.</li>';
  };
  const segna = async (x, si) => {
    x.mandato = si; disegnaInvii();
    const r = await api({ op: 'segna', tipo: x.tipo, id: x.id, si });
    if (!r.ok) { x.mandato = !si; disegnaInvii(); alert('non salvato: nessuna connessione. riprova.'); }
  };
  $('lista-invii').addEventListener('click', (e) => {
    const b = e.target.closest('.sms');
    if (!b) return;
    const [tipo, id] = b.dataset.k.split(':');
    const x = (invii[scheda] || []).find((y) => y.tipo === tipo && y.id === id);
    if (!x) return;
    if (b.tagName === 'A') { setTimeout(() => segna(x, true), 400); return; }   // si apre Messaggi: la segno come fatta
    if (!b.dataset.ok) { chiediInv = b.dataset.k; disegnaInvii(); clearTimeout(timerInv); timerInv = setTimeout(() => { chiediInv = ''; disegnaInvii(); }, 5000); return; }
    clearTimeout(timerInv); chiediInv = ''; segna(x, false);
  });
  document.querySelectorAll('.schede-invii button').forEach((b) => b.addEventListener('click', () => {
    scheda = b.dataset.tipo; chiediInv = '';
    document.querySelectorAll('.schede-invii button').forEach((y) => y.setAttribute('aria-pressed', String(y === b)));
    disegnaInvii();
  }));
  $('inv-tutti').addEventListener('change', disegnaInvii);
  $('apri-invii').addEventListener('click', (e) => { e.preventDefault(); $('pannello').hidden = true; $('vista-invii').hidden = false; window.scrollTo(0, 0); caricaInvii(); });
  $('chiudi-invii').addEventListener('click', () => { $('vista-invii').hidden = true; $('pannello').hidden = false; aggiorna(); });

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
    try { sessionStorage.removeItem('zc-regia'); sessionStorage.removeItem('zc-regia-s'); } catch (e) { /* niente */ }
    sessione = '';
    pin = ''; $('pannello').hidden = true; $('vista-bk').hidden = true; $('vista-invii').hidden = true; $('accesso').hidden = false;
  };

  $('f-pin').addEventListener('submit', (e) => { e.preventDefault(); pin = e.target.pin.value.trim(); metti('err-pin', ''); entra(); });
  $('esci').addEventListener('click', (e) => { e.preventDefault(); esci(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!$('pannello').hidden) aggiorna();
    if (!$('vista-bk').hidden) caricaBk();
    if (!$('vista-invii').hidden) caricaInvii();
  });
  if (pin) entra();
})();
