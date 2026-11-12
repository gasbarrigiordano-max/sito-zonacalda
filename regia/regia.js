// Zonacalda — regia: i numeri della serata per l'organizzatore. Solo lettura, si aggiorna da sola ogni 15 secondi.
(() => {
  const $ = (id) => document.getElementById(id);
  let pin = '';
  const mem = {
    leggi: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    scrivi: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } },
    togli: (k) => { try { localStorage.removeItem(k); } catch (e) { /* niente */ } },
  };
  const ORE_ACCESSO = 5;                                      // dopo il PIN si resta dentro 5 ore, anche ricaricando
  let giro = 0, falliti = 0, sessione = '';
  const api = async (dati) => {
    const r = await zcApi({ azione: 'regia', pin, sessione, ...dati });
    if (r && r.sessione) {
      sessione = r.sessione;
      const a = mem.leggi('zc-regia-accesso'); if (a) { a.s = sessione; mem.scrivi('zc-regia-accesso', a); }
    }
    return r;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const maiuscole = (s) => String(s || '').toLocaleLowerCase('it').replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('it'));
  const metti = (id, v) => { $(id).textContent = v; };

  const mostra = (r) => {
    const L = r.lista, B = r.backstage, S = r.staff;
    // dentro su attesi: pista e backstage confermati (anche già entrati); staff a parte, tra parentesi
    const dentroPB = L.entrato + B.entrato, attesiPB = L.confermato + L.entrato + B.confermato + B.entrato;
    const dentroS = S.entrato + S.aMano, attesiS = S.registrato + S.entrato + S.aMano;
    metti('agg', r.aggiornato); metti('dentro', dentroPB); metti('capienza', attesiPB);
    metti('tot-staff', `(staff ${dentroS} / ${attesiS} · in tutto ${dentroPB + dentroS} / ${attesiPB + attesiS})`);
    $('riempi').style.width = (attesiPB ? Math.min(100, (dentroPB / attesiPB) * 100) : 0) + '%';
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
    if (r.ok) { falliti = 0; mostra(r); mem.scrivi('zc-regia-dati', r); $('stato').className = 'stato'; metti('stato', 'si aggiorna da sola ogni 15 secondi.'); }
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
      // prima si conferma la richiesta, poi compare "segna pagato"
      const azione = p.stato === 'richiesta' ? 'conferma' : p.stato === 'annullato' ? '' : 'pagato';
      const b = !azione ? ''
        : chiedi === p.id ? `<button class="spunta chiedi" data-id="${esc(p.id)}" data-az="${azione}" data-ok="1">${azione === 'conferma' ? 'confermi? ok' : p.pagato ? 'togliere? ok' : 'pagato? ok'}</button>`
        : azione === 'conferma' ? `<button class="spunta conferma" data-id="${esc(p.id)}" data-az="conferma">conferma</button>`
        : p.pagato ? `<button class="spunta si" data-id="${esc(p.id)}" data-az="pagato">✓ pagato</button>`
        : `<button class="spunta" data-id="${esc(p.id)}" data-az="pagato">segna pagato</button>`;
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
    const r = b.dataset.az === 'conferma' ? await api({ op: 'conferma', id, si: true }) : await api({ op: 'pagato', id, si: !p.pagato });
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

  // ------------------------------------------------ i nomi dietro a ogni numero
  let nomi = [], tipoNomi = '';
  const disegnaNomi = () => {
    const q = $('q-nomi').value.trim().toLowerCase();
    const righe = nomi.filter((x) => !q || x.nome.toLowerCase().includes(q));
    metti('nomi-conto', righe.length + (q ? ' su ' + nomi.length : ''));
    $('lista-nomi').innerHTML = righe.length ? righe.map((x) => {
      const info = [x.eta !== null && x.eta !== undefined ? x.eta + ' anni' : '', x.ora ? 'entrato ' + x.ora : '',
        tipoNomi === 'genere' || /,/.test($('nomi-titolo').dataset.stati || '') ? x.stato : '', x.pagato ? '✓ pagato' : ''].filter(Boolean).join(' · ');
      const t = x.tel ? ` <a href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">${esc(x.tel)}</a>` : '';
      return `<li><b>${esc(maiuscole(x.nome))}</b><small>${esc(info)}</small>${t}${tipoNomi === 'backstage' ? azioneBk(x) : ''}</li>`;
    }).join('') : '<li>nessuno.</li>';
  };
  // backstage: dall'elenco si conferma e poi si manda l'SMS con il pass d'oro
  let mostrati = null, chiediNome = '', timerNome = 0;
  const azioneBk = (x) => {
    if (!x.id) return '';
    if (x.stato === 'richiesta') {
      return chiediNome === x.id ? `<button class="spunta chiedi az-bk" data-id="${esc(x.id)}" data-az="conferma" data-ok="1">confermi? ok</button>`
        : `<button class="spunta conferma az-bk" data-id="${esc(x.id)}" data-az="conferma">conferma</button>`;
    }
    if (x.stato !== 'confermato' && x.stato !== 'entrato') return '';
    if (!x.sms) return '';
    if (x.sms.mandato) return '<span class="sms fatto">✓ SMS mandato</span>';
    return x.sms.tel ? `<a class="sms az-bk" data-id="${esc(x.id)}" data-az="sms" href="${esc(linkSms(x.sms.tel, x.sms.testo))}">manda SMS</a>` : '';
  };
  const caricaBkNomi = async (stati) => {
    const [n, b, i] = await Promise.all([api({ op: 'nomi', tipo: 'backstage', stati: ['richiesta', 'confermato', 'entrato', 'annullato'] }), api({ op: 'backstage' }), api({ op: 'invii' })]);
    if (!n.ok || !b.ok) return false;
    const chiave = (s) => String(s || '').toLowerCase().trim();
    const extra = new Map(n.persone.map((p) => [chiave(p.nome), p]));
    const sms = new Map(((i.ok && i.invii && i.invii.backstage) || []).map((x) => [x.id, x]));
    const tutti = b.persone.map((p) => {
      const e = extra.get(chiave(p.nome + ' ' + p.cognome)) || {};
      return { id: p.id, nome: p.nome + ' ' + p.cognome, stato: p.stato, eta: e.eta, tel: e.tel, ora: p.entrato, pagato: !!p.pagato, sms: sms.get(p.id) };
    });
    if (!mostrati) mostrati = new Set(tutti.filter((p) => stati.includes(p.stato)).map((p) => p.id));   // chi confermi resta in elenco
    nomi = tutti.filter((p) => mostrati.has(p.id)).sort((a, z) => a.nome.localeCompare(z.nome, 'it'));
    return true;
  };
  $('lista-nomi').addEventListener('click', async (e) => {
    const b = e.target.closest('.az-bk');
    if (!b) return;
    const id = b.dataset.id, x = nomi.find((y) => y.id === id);
    if (!x) return;
    if (b.dataset.az === 'sms') { setTimeout(async () => { x.sms.mandato = true; disegnaNomi(); await api({ op: 'segna', tipo: 'backstage', id, si: true }); }, 400); return; }
    if (!b.dataset.ok) { chiediNome = id; disegnaNomi(); clearTimeout(timerNome); timerNome = setTimeout(() => { chiediNome = ''; disegnaNomi(); }, 5000); return; }
    clearTimeout(timerNome); chiediNome = '';
    b.disabled = true; b.textContent = 'salvo…';
    const r = await api({ op: 'conferma', id, si: true });
    if (!r.ok) { disegnaNomi(); return alert('non salvato: nessuna connessione. riprova.'); }
    await caricaBkNomi([]); disegnaNomi();
  });

  const apriNomi = async (el) => {
    tipoNomi = el.dataset.tipo;
    metti('nomi-titolo', el.dataset.titolo); $('nomi-titolo').dataset.stati = el.dataset.stati || '';
    $('q-nomi').value = ''; nomi = []; $('lista-nomi').innerHTML = '<li>carico…</li>'; metti('nomi-conto', '');
    $('pannello').hidden = true; $('vista-nomi').hidden = false; window.scrollTo(0, 0);
    if (tipoNomi === 'backstage') {
      mostrati = null; chiediNome = '';
      if (await caricaBkNomi((el.dataset.stati || '').split(','))) disegnaNomi(); else $('lista-nomi').innerHTML = '<li>nessuna connessione. riprova.</li>';
      return;
    }
    const r = await api({ op: 'nomi', tipo: tipoNomi, stati: (el.dataset.stati || '').split(','), g: el.dataset.g });
    if (r.ok) { nomi = r.persone; disegnaNomi(); } else $('lista-nomi').innerHTML = '<li>nessuna connessione. riprova.</li>';
  };
  document.querySelectorAll('.n.apre').forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); apriNomi(el); });   // dentro il blocco backstage non apre l'elenco pagamenti
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); apriNomi(el); } });
  });
  $('q-nomi').addEventListener('input', disegnaNomi);
  $('chiudi-nomi').addEventListener('click', () => { $('vista-nomi').hidden = true; $('pannello').hidden = false; aggiorna(); });

  const entra = async () => {
    const r = await aggiorna();
    if (!r.ok) {
      metti('err-pin', r.errore === 'bloccato' ? 'troppi tentativi. riprova tra 10 minuti.'
        : r.errore === 'pin' ? 'PIN sbagliato.' : r.errore === 'non_attivo' ? 'sistema non ancora collegato.' : 'nessuna connessione. riprova.');
      return;
    }
    mem.scrivi('zc-regia-accesso', { pin, s: sessione, scade: Date.now() + ORE_ACCESSO * 3600e3 });
    apri();
  };
  const apri = () => {
    $('accesso').hidden = true; $('pannello').hidden = false;
    document.documentElement.classList.remove('dentro');   // da qui in poi decide lo script
    clearInterval(giro); giro = setInterval(aggiorna, 15000);
  };
  const esci = () => {
    clearInterval(giro);
    mem.togli('zc-regia-accesso'); mem.togli('zc-regia-dati');
    document.documentElement.classList.remove('dentro');
    sessione = '';
    pin = ''; $('pannello').hidden = true; $('vista-bk').hidden = true; $('vista-invii').hidden = true; $('vista-nomi').hidden = true; $('accesso').hidden = false;
  };

  $('f-pin').addEventListener('submit', (e) => { e.preventDefault(); pin = e.target.pin.value.trim(); metti('err-pin', ''); entra(); });
  $('esci').addEventListener('click', (e) => { e.preventDefault(); esci(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!$('pannello').hidden) aggiorna();
    if (!$('vista-bk').hidden) caricaBk();
    if (!$('vista-invii').hidden) caricaInvii();
  });
  // accesso salvato: si entra subito con gli ultimi numeri, e intanto si aggiornano
  {
    const a = mem.leggi('zc-regia-accesso');
    if (a && a.pin && a.scade > Date.now()) {
      pin = a.pin; sessione = a.s || '';
      const d = mem.leggi('zc-regia-dati');
      if (d && d.lista) mostra(d);
      apri(); aggiorna();
    } else { mem.togli('zc-regia-accesso'); document.documentElement.classList.remove('dentro'); }
  }
})();
