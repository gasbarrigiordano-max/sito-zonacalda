// Zonacalda — regia: i numeri della serata per l'organizzatore. Solo lettura, si aggiorna da sola ogni 15 secondi.
(() => {
  const $ = (id) => document.getElementById(id);
  let pin = '';
  const mem = {
    leggi: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    scrivi: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } },
    togli: (k) => { try { localStorage.removeItem(k); } catch (e) { /* niente */ } },
  };
  const ORE_ACCESSO = 24 * 90;                                // dopo il PIN questo dispositivo resta autorizzato 90 giorni dall'ultimo uso (si toglie con "esci" o cambiando il PIN)
  let giro = 0, falliti = 0, sessione = '';
  const api = async (dati) => {
    const r = await zcApi({ azione: 'regia', pin, sessione, ...dati });
    if (r && r.sessione) {
      sessione = r.sessione;
      const a = mem.leggi('zc-regia-accesso'); if (a) { a.s = sessione; mem.scrivi('zc-regia-accesso', a); }
    }
    if (r && r.ok) {                                          // finché lo usi non scade: il tempo riparte dall'ultimo uso (si riscrive al massimo una volta all'ora)
      const a = mem.leggi('zc-regia-accesso');
      if (a && a.pin && Date.now() - (a.r || 0) > 3600e3) { a.scade = Date.now() + ORE_ACCESSO * 3600e3; a.r = Date.now(); mem.scrivi('zc-regia-accesso', a); }
    }
    return r;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const maiuscole = (s) => String(s || '').toLocaleLowerCase('it').replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('it'));
  const metti = (id, v) => { $(id).textContent = v; };
  const testoGeneri = (m, f, i) => m + (m === 1 ? ' uomo' : ' uomini') + ' · ' + f + (f === 1 ? ' donna' : ' donne') + (i ? ' · ' + i + (i === 1 ? ' incerto' : ' incerti') : '');

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
    const G = r.generi, gen = (id, o) => metti(id, o ? testoGeneri(o.m, o.f, o.i) : '');
    if (G && G.lista) { gen('gl-entrati', G.lista.entrato); gen('gl-attesi', G.lista.confermato); gen('gl-invitati', G.lista.invitato); gen('gl-inlista', G.lista['in lista']); gen('gl-dainvitare', G.lista['da invitare']); }
    if (G && G.backstage) { gen('gb-entrati', G.backstage.entrato); gen('gb-attesi', G.backstage.confermato); gen('gb-richieste', G.backstage.richiesta); }
    metti('b-tot', (B.totale - B.annullato) + ' / ' + B.posti + ' posti');
    metti('b-entrati', B.entrato); metti('b-attesi', B.confermato); metti('b-richieste', B.richiesta);
    metti('b-pagati', B.pagati); metti('b-dapagare', B.daPagare);
    metti('s-tot', S.totale + ' in lista' + (S.aMano ? ' · ' + S.aMano + ' a mano' : ''));
    metti('s-entrati', S.entrato + S.aMano); metti('s-attesi', S.registrato); metti('s-noreg', S.abilitato);
    const P = r.pubblico, anni = (v) => (v === null || v === undefined ? '–' : String(v).replace('.', ','));
    if (P) {
      metti('p-donne', P.donne); metti('p-uomini', P.uomini); metti('p-eta-d', anni(P.etaDonne)); metti('p-eta-u', anni(P.etaUomini)); metti('p-eta', anni(P.etaTutti));
      metti('p-incerti', (P.incerti ? P.incerti + ' con un nome che non dice se uomo o donna (contati solo nell\'età di tutti). ' : '') + 'uomo o donna è una stima dal nome.');
      const vi = $('vedi-incerti'); vi.hidden = !P.incerti; vi.textContent = P.incerti === 1 ? 'assegna l\'incerto' : 'assegna i ' + P.incerti + ' incerti';
    }
    $('ultimi').innerHTML = r.ultimi.length
      ? r.ultimi.map((u) => `<li><time>${esc(u.ora)}</time><span>${esc(maiuscole(u.chi))}</span><em class="${esc(u.tipo)}">${esc(u.tipo)}</em></li>`).join('')
      : '<li>nessuno, per ora.</li>';
    $('ultimi-piu').hidden = r.ultimi.length <= 5;
    if (!$('ultimi').classList.contains('aperto')) metti('ultimi-piu', 'mostra tutti (' + r.ultimi.length + ')');
  };
  // telefono: si tocca il riquadro "ultimi ingressi" (o la scritta sotto) per aprire tutti, e di nuovo per richiudere
  $('blocco-ultimi').addEventListener('click', () => {
    if (!matchMedia('(max-width: 819px)').matches || $('ultimi-piu').hidden) return;
    const aperto = $('ultimi').classList.toggle('aperto');
    $('blocco-ultimi').classList.toggle('aperto', aperto);
    metti('ultimi-piu', aperto ? 'mostra meno' : 'mostra tutti (' + $('ultimi').children.length + ')');
  });

  const aggiorna = async () => {
    const r = await api({});
    if (r.ok) { falliti = 0; mostra(r); mem.scrivi('zc-regia-dati', r); $('stato').className = 'stato'; metti('stato', 'si aggiorna da sola ogni 15 secondi.'); }
    else if (r.errore === 'pin' || r.errore === 'bloccato') { esci(); }
    else { falliti++; $('stato').className = 'stato male'; metti('stato', 'il foglio non ha risposto: i numeri sono quelli delle ' + $('agg').textContent + '. riprovo…'); }
    return r;
  };

  // ------------------------------------------------ backstage: elenco e pagamenti
  // ------------------------------------------------ dati pronti: memoria del telefono + niente richieste doppie
  const inVolo = {};
  const spia = document.createElement('div');
  spia.textContent = 'aggiorno…';
  spia.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top));right:10px;z-index:9;font-size:.75rem;color:#ffcf7a;background:#2a1a05;border-radius:99px;padding:.15rem .6rem;display:none';
  document.body.appendChild(spia);
  const spiaOn = () => { spia.style.display = Object.keys(inVolo).length ? 'block' : 'none'; };
  // fresco: se i dati salvati hanno meno di N ms non si richiede niente (Google risponde una richiesta alla volta)
  const scarica = (chiave, dati, fresco = 0) => {
    if (inVolo[chiave]) return inVolo[chiave];
    const g = mem.leggi('zc-regia-c-' + chiave);
    if (fresco && g && g.ok && Date.now() - (g.quando || 0) < fresco) return Promise.resolve(g);
    inVolo[chiave] = api(dati).then((r) => {
      delete inVolo[chiave]; spiaOn();
      if (r.ok) mem.scrivi('zc-regia-c-' + chiave, Object.assign(r, { quando: Date.now() }));
      return r;
    });
    spiaOn();
    return inVolo[chiave];
  };
  const giaVisto = (chiave) => mem.leggi('zc-regia-c-' + chiave);
  const vecchio = (...chiavi) => chiavi.forEach((k) => { const g = mem.leggi('zc-regia-c-' + k); if (g) { g.quando = 0; mem.scrivi('zc-regia-c-' + k, g); } });
  const precarica = () => { if (document.visibilityState === 'visible' && pin) { scarica('invii', { op: 'invii' }, 50000); scarica('backstage', { op: 'backstage' }, 50000); } };

  // SMS segnati da questo telefono: valgono finché il foglio non li conferma (così un elenco vecchio non li rimette "da mandare")
  const segnati = mem.leggi('zc-regia-segnati') || {};
  const ricordaSegnato = (tipo, id, si) => { segnati[tipo + ':' + id] = { v: !!si, t: Date.now() }; mem.scrivi('zc-regia-segnati', segnati); };
  const sistemaInvii = (inv) => {
    if (!inv) return inv;
    let cambiato = false;
    ['inviti', 'backstage', 'staff'].forEach((g) => (inv[g] || []).forEach((x) => {
      const k = x.tipo + ':' + x.id, o = segnati[k];
      if (!o) return;
      if (!!x.mandato === o.v || Date.now() - o.t > 3 * 60e3) { delete segnati[k]; cambiato = true; }   // il foglio è d'accordo, o sono passati 3 minuti (dal foglio si possono rimettere "da mandare")
      else x.mandato = o.v;
    }));
    if (cambiato) mem.scrivi('zc-regia-segnati', segnati);
    return inv;
  };

  let bk = [], chiedi = '';
  const inCorso = new Map();                              // id → cosa si sta salvando (resta anche se la lista si ridisegna)
  const disegnaBk = () => {
    const q = $('q-bk').value.trim().toLowerCase();
    const righe = bk.map((p, i) => ({ p, i })).filter(({ p }) => !q || (p.nome + ' ' + p.cognome + ' ' + p.cognome + ' ' + p.nome).toLowerCase().includes(q));
    $('lista-bk').innerHTML = righe.length ? righe.map(({ p, i }) => {
      const info = `prenotato ${esc(p.prenotato)} · ${esc(p.stato)}${p.entrato ? ' alle ' + esc(p.entrato) : ''}`;
      // prima si conferma la richiesta, poi compare "segna pagato"
      const azione = p.stato === 'richiesta' ? 'conferma' : p.stato === 'annullato' ? '' : 'pagato';
      const b = !azione ? ''
        : inCorso.has(p.id) ? '<button class="spunta chiedi" disabled>salvo…</button>'
        : chiedi === p.id ? `<button class="spunta chiedi" data-id="${esc(p.id)}" data-az="${azione}" data-ok="1">${azione === 'conferma' ? 'confermi? ok' : p.pagato ? 'togliere? ok' : 'pagato? ok'}</button>`
        : azione === 'conferma' ? `<button class="spunta conferma" data-id="${esc(p.id)}" data-az="conferma">conferma</button>`
        : p.pagato ? `<button class="spunta si" data-id="${esc(p.id)}" data-az="pagato">✓ pagato</button>`
        : `<button class="spunta" data-id="${esc(p.id)}" data-az="pagato">segna pagato</button>`;
      return `<li><span class="num">${i + 1}</span><div class="chi"><b>${esc(maiuscole(p.nome + ' ' + p.cognome))}</b><small class="${esc(p.stato)}">${info}</small></div>${b}</li>`;
    }).join('') : '<li>nessuno.</li>';
  };
  const caricaBk = async () => {
    const g = giaVisto('backstage');
    if (g && g.persone && !bk.length) { bk = g.persone; disegnaBk(); }           // subito gli ultimi dati
    const r = await scarica('backstage', { op: 'backstage' }, 15000);
    if (r.ok) {
      bk = r.persone.map((y) => (inCorso.has(y.id) ? bk.find((z) => z.id === y.id) || y : y)); disegnaBk();
    } else if (!bk.length) $('lista-bk').innerHTML = '<li>il foglio non ha risposto. riprova.</li>';
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
    const az = b.dataset.az;
    inCorso.set(id, az); disegnaBk();
    const r = az === 'conferma' ? await api({ op: 'conferma', id, si: true }) : await api({ op: 'pagato', id, si: !p.pagato });
    inCorso.delete(id);
    vecchio('backstage', 'nomi-bk', 'invii');
    if (r.ok) {
      const nuovi = new Map(r.persone.map((y) => [y.id, y]));
      bk = bk.map((y) => (inCorso.has(y.id) ? y : nuovi.get(y.id) || y));   // chi è ancora in salvataggio resta com'è
      disegnaBk(); aggiorna();
    } else { disegnaBk(); alert('non salvato: il foglio non ha risposto (o la rete è caduta). riprova.'); }
  });
  $('q-bk').addEventListener('input', disegnaBk);
  const apriBk = () => { $('pannello').hidden = true; $('vista-bk').hidden = false; window.scrollTo(0, 0); caricaBk(); };
  $('apri-bk').addEventListener('click', apriBk);
  $('apri-bk').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriBk(); } });
  $('chiudi-bk').addEventListener('click', () => { $('vista-bk').hidden = true; $('pannello').hidden = false; aggiorna(); });

  // ------------------------------------------------ invii SMS dal telefono
  let invii = null, scheda = 'inviti', chiediInv = '', timerInv = 0;
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const linkSms = (tel, testo) => 'sms:' + tel.replace(/[^\d+]/g, '') + (iPhone ? '&' : '?') + 'body=' + encodeURIComponent(String(testo).replace(/\*/g, ''));
  // ogni invio ha due tasti: WhatsApp e SMS, stesso testo. toccare l'uno o l'altro segna la persona come fatta
  const linkWa = (tel, testo) => { let n = String(tel).replace(/\D/g, ''); if (n.length <= 10 && n[0] === '3') n = '39' + n; return 'https://wa.me/' + n + '?text=' + encodeURIComponent(testo); };
  const dueInvii = (cls, attr, tel, testo) => `<a class="sms wa ${cls}" ${attr} href="${esc(linkWa(tel, testo))}" target="_blank" rel="noopener">WhatsApp</a>` +
    `<a class="sms ${cls}" ${attr} href="${esc(linkSms(tel, testo))}">SMS</a>`;
  // il link del pass (backstage o staff) è già dentro il testo del messaggio: da lì si apre il QR, senza chiedere niente al foglio
  const linkPass = (testo) => { const m = String(testo || '').match(/https?:\/\/\S+\/(?:backstage|staff)\/\?t=[A-Za-z0-9]+/); return m ? m[0] : ''; };
  const tastoQr = (testo) => { const u = linkPass(testo); return u ? `<a class="sms qr" href="${esc(u)}" target="_blank" rel="noopener">QR</a>` : ''; };
  const disegnaInvii = () => {
    if (!invii) return;
    const tutti = $('inv-tutti').checked;
    const elenco = invii[scheda] || [];
    const daFare = elenco.filter((x) => !x.mandato).length;
    metti('inv-conto', daFare + ' da mandare su ' + elenco.length);
    const righe = elenco.filter((x) => tutti || !x.mandato || chiediInv === x.id);
    $('lista-invii').innerHTML = righe.length ? righe.map((x) => {
      const k = x.tipo + ':' + x.id;
      const b0 = chiediInv === k ? `<button class="sms chiedi" data-k="${esc(k)}" data-ok="1">togliere? ok</button>`
        : x.mandato ? `<button class="sms fatto" data-k="${esc(k)}">✓ mandato</button>`
        : x.tel ? dueInvii('', `data-k="${esc(k)}"`, x.tel, x.testo) : '<span class="piccoli">manca il numero</span>';
      const b = `<span class="due">${tastoQr(x.testo)}${b0}</span>`;
      return `<li class="${x.mandato ? 'fatto' : ''}"><div class="chi"><b>${esc(maiuscole(x.nome))}</b><small>${esc(x.tel || '')}</small></div>${b}</li>`;
    }).join('') : '<li>' + (elenco.length ? 'tutti mandati. ✓' : 'nessuno.') + '</li>';
  };
  const caricaInvii = async () => {
    const g = giaVisto('invii');
    if (g && g.invii && !invii) { invii = sistemaInvii(g.invii); disegnaInvii(); }   // subito gli ultimi dati
    const r = await scarica('invii', { op: 'invii' }, 15000);
    if (r.ok) { invii = sistemaInvii(r.invii); disegnaInvii(); } else if (!invii) $('lista-invii').innerHTML = '<li>il foglio non ha risposto. riprova.</li>';
  };
  const segna = async (x, si) => {
    x.mandato = si; ricordaSegnato(x.tipo, x.id, si); disegnaInvii();
    const r = await api({ op: 'segna', tipo: x.tipo, id: x.id, si });
    vecchio('invii');
    if (!r.ok) { x.mandato = !si; ricordaSegnato(x.tipo, x.id, !si); disegnaInvii(); alert('non salvato: il foglio non ha risposto (o la rete è caduta). riprova.'); }
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
  let nomi = [], tipoNomi = ''; let gNomi = ''; let pannelloAperto = false;
  // ordine dell'elenco della pista: alfabetico, oppure cronologico (dal più vecchio: registrati, invitati o confermati per primi)
  let ordine = mem.leggi('zc-regia-ordine') === 'cron' ? 'cron' : 'az';
  let ultimoAggiunto = '';
  const aggiunti = new Set();                              // persone aggiunte a mano da questa schermata: restano in elenco finché non esci
  const impostaOrdine = () => document.querySelectorAll('.ordine button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === ordine)));
  document.querySelectorAll('.ordine button').forEach((b) => b.addEventListener('click', () => {
    ordine = b.dataset.o; mem.scrivi('zc-regia-ordine', ordine); impostaOrdine(); disegnaNomi();
  }));
  const ordina = (v) => (ordine === 'cron' && tipoNomi === 'lista'
    ? v.slice().sort((a, z) => (a.t && z.t ? a.t - z.t : a.t ? -1 : z.t ? 1 : 0) || String(a.nome).localeCompare(String(z.nome), 'it'))
    : v);
  const disegnaNomi = () => {
    const q = $('q-nomi').value.trim().toLowerCase();
    const righe = ordina(nomi).filter((x) => !q || x.nome.toLowerCase().includes(q));
    const anni = nomi.map((x) => x.eta).filter((e) => typeof e === 'number' && e >= 0 && e < 100);
    const media = anni.length ? ' · età media ' + (Math.round(anni.reduce((a, b) => a + b, 0) / anni.length * 10) / 10).toString().replace('.', ',') : '';
    metti('nomi-conto', righe.length + (q ? ' su ' + nomi.length : '') + media);
    // uomini e donne (stimati dal nome, come nel riepilogo): solo se il foglio li manda e l'elenco non è già diviso per genere
    const conG = tipoNomi !== 'genere' && nomi.some((x) => typeof x.g === 'string');
    const nG = (g) => nomi.filter((x) => (x.g || '') === g).length;
    metti('nomi-pubblico', conG ? testoGeneri(nG('m'), nG('f'), nG('')) : '');
    $('nomi-pubblico').hidden = !conG;
    { const inc = conG ? nomi.filter((x) => (x.g || '') === '') : [], bt = $('assegna-qui'), pn = $('pannello-assegna');
      bt.hidden = !inc.length; bt.textContent = pannelloAperto ? 'chiudi' : (inc.length === 1 ? 'assegna l\'incerto di questo elenco' : 'assegna i ' + inc.length + ' incerti di questo elenco');
      const primo = (v) => String(v || '').trim().toLowerCase().split(/[\s-]+/)[0];
      const unici = [...new Map(inc.map((x) => [primo(x.nome), x])).values()];
      pn.hidden = !(pannelloAperto && unici.length);
      pn.innerHTML = unici.map((x) => `<li><b>${esc(maiuscole(primo(x.nome)))}</b><span class="sesso"><button class="spunta az-sesso" data-az="sesso2" data-g="m" data-nome="${esc(primo(x.nome))}">uomo</button><button class="spunta az-sesso" data-az="sesso2" data-g="f" data-nome="${esc(primo(x.nome))}">donna</button></span></li>`).join(''); }
    mostraTutti();
    $('lista-nomi').innerHTML = righe.length ? righe.map((x) => {
      const info = [x.eta !== null && x.eta !== undefined ? x.eta + ' anni' : '', x.ora ? 'entrato ' + x.ora : '',
        tipoNomi === 'genere' || /,/.test($('nomi-titolo').dataset.stati || '') ? x.stato : '', x.pagato ? '✓ pagato' : '',
        ordine === 'cron' && tipoNomi === 'lista' ? x.quando : ''].filter(Boolean).join(' · ');
      const t = x.tel ? ` <a href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">${esc(x.tel)}</a>` : '';
      return `<li${x.id && x.id === ultimoAggiunto ? ' class="nuovo"' : ''}><b>${esc(maiuscole(x.nome))}</b><small>${esc(info)}</small>${t}${tipoNomi === 'backstage' ? azioneBk(x) : tipoNomi === 'lista' ? azioneLista(x) : tipoNomi === 'staff' ? azioneStaff(x) : tipoNomi === 'genere' && gNomi === '' ? `<span class="sesso"><button class="spunta az-sesso" data-az="sesso" data-g="m" data-nome="${esc(x.nome)}">uomo</button><button class="spunta az-sesso" data-az="sesso" data-g="f" data-nome="${esc(x.nome)}">donna</button></span>` : ''}</li>`;
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
    if (x.attesa) return '<span class="sms chiedi">preparo…</span>';
    if (!x.sms) return '';
    const qr = tastoQr(x.sms.testo);
    if (x.sms.mandato) return `<span class="due">${qr}<span class="sms fatto">✓ mandato</span></span>`;
    return `<span class="due">${qr}${x.sms.tel ? dueInvii('az-bk', `data-id="${esc(x.id)}" data-az="sms"`, x.sms.tel, x.sms.testo) : ''}</span>`;
  };
  // staff: il QR del pass di chi si è registrato (il link viene dall'elenco invii)
  let inviiStaff = new Map();
  const chiaveNome = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const azioneStaff = (x) => { const s = inviiStaff.get(chiaveNome(x.nome)); return s ? `<span class="due">${tastoQr(s.testo)}</span>` : ''; };
  const caricaInviiStaff = async () => {
    const usa = (r) => { if (r && r.ok && r.invii) { inviiStaff = new Map((r.invii.staff || []).map((s) => [chiaveNome(s.nome), s])); return true; } return false; };
    const g = giaVisto('invii'); if (usa(g) && tipoNomi === 'staff') disegnaNomi();
    if (usa(await scarica('invii', { op: 'invii' }, 15000)) && tipoNomi === 'staff') disegnaNomi();
  };
  // pista: chi ha l'invito ma non ha confermato (o l'ha fatto scadere) si conferma da qui, poi parte l'SMS con il suo ingresso
  const fattiLista = new Map();                           // id → { attesa, sms, mandato }: resta anche se l'elenco si ricarica
  // perché il foglio ha detto di no: persona non trovata (con il suo codice) oppure lo stato che ha adesso
  const spiega = (r, id) => (r.errore === 'persona' ? 'non trovo questa persona nel foglio (codice ' + id + ')' : 'nel foglio risulta «' + (r.stato || '?') + '»');
  const vecchiaLista = () => { try { Object.keys(localStorage).filter((k) => k.indexOf('zc-regia-c-nomi-lista-') === 0).forEach((k) => vecchio(k.slice('zc-regia-c-'.length))); } catch (err) { /* niente */ } };
  const azioneLista0 = (x) => {
    if (!x.id) return '';
    const f = fattiLista.get(x.id);
    if (f) {
      if (f.attesa) return `<button class="spunta chiedi" disabled>${f.leggo ? 'carico…' : 'salvo…'}</button>`;
      if (f.pass) {                                       // pass di chi ha già confermato: si guarda il QR e, se serve, si rimanda
        const s = f.mandato ? '<span class="sms fatto">✓ mandato</span>'
          : f.sms && f.sms.tel ? dueInvii('az-li', `data-id="${esc(x.id)}" data-az="sms"`, f.sms.tel, f.sms.testo) : '';
        return `<span class="due"><a class="sms qr" href="${esc(f.pass)}" target="_blank" rel="noopener">vedi QR</a>${s}</span>`;
      }
      const qrSubito = f.invito ? `<button class="spunta az-li" data-id="${esc(x.id)}" data-az="qrsub">genera QR</button>` : '';   // dopo "invita": conferma dalla regia e mostra il QR, senza altri passaggi
      if (f.mandato) return `<span class="due">${qrSubito}<span class="sms fatto">✓ mandato</span></span>`;
      if (qrSubito) return `<span class="due">${qrSubito}${f.sms && f.sms.tel ? dueInvii('az-li', `data-id="${esc(x.id)}" data-az="sms"`, f.sms.tel, f.sms.testo) : ''}</span>`;
      return f.sms && f.sms.tel ? `<span class="due">${dueInvii('az-li', `data-id="${esc(x.id)}" data-az="sms"`, f.sms.tel, f.sms.testo)}</span>` : '<span class="sms fatto">✓ confermato</span>';
    }
    if (x.stato === 'confermato' && $('nomi-titolo').dataset.stati === 'confermato') return `<button class="spunta az-li" data-id="${esc(x.id)}" data-az="pass" data-ok="1">QR / pass</button>`;
    if (x.stato === 'in lista') return `<button class="spunta az-li" data-id="${esc(x.id)}" data-az="scegli" data-ok="1">da invitare</button>`;   // come cambiare lo stato nel foglio
    if (x.stato === 'da invitare') {                      // manda l'invito: la conferma resta all'invitato
      return chiediNome === x.id ? `<button class="spunta chiedi az-li" data-id="${esc(x.id)}" data-az="invita" data-ok="1">inviti? ok</button>`
        : `<button class="spunta conferma az-li" data-id="${esc(x.id)}" data-az="invita">invita</button>`;
    }
    if (x.stato !== 'invitato' && x.stato !== 'scaduto') return '';
    return chiediNome === x.id ? `<button class="spunta chiedi az-li" data-id="${esc(x.id)}" data-az="conferma" data-ok="1">confermi? ok</button>`
      : `<button class="spunta conferma az-li" data-id="${esc(x.id)}" data-az="conferma">conferma</button>`;
  };
  // elimina dalla pista (per esempio chi si è iscritto anche al backstage): due tocchi, e subito dopo si può annullare
  const eliminati = new Map();                            // id → 'attesa' | 'fatto'
  let chiediElimina = '', timerElimina = 0;
  const SI_ELIMINA = ['in lista', 'invitato', 'confermato'];
  const azioneLista = (x) => {
    if (!x.id) return '';
    const e = eliminati.get(x.id);
    if (e === 'attesa') return '<button class="spunta chiedi" disabled>salvo…</button>';
    if (e === 'fatto') return `<span class="due"><span class="sms tolto">✕ eliminato</span><button class="spunta az-el" data-id="${esc(x.id)}" data-az="annulla">annulla</button></span>`;
    const principale = azioneLista0(x);
    if (fattiLista.has(x.id) || SI_ELIMINA.indexOf(x.stato) < 0) return principale;
    const el = chiediElimina === x.id ? `<button class="spunta elimina chiedi az-el" data-id="${esc(x.id)}" data-az="elimina" data-ok="1">elimini? ok</button>`
      : `<button class="spunta elimina az-el" data-id="${esc(x.id)}" data-az="elimina">elimina</button>`;
    return `<span class="due">${el}${principale}</span>`;
  };
  // incerti dentro un elenco (confermati, invitati, da invitare...): "assegna" apre l'elenco dei nomi, un tocco e vale uomo o donna per sempre
  $('assegna-qui').addEventListener('click', () => { pannelloAperto = !pannelloAperto; disegnaNomi(); });
  $('pannello-assegna').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-az="sesso2"]');
    if (!b) return;
    b.disabled = true;
    const r = await api({ op: 'impostagenere', nome: b.dataset.nome, g: b.dataset.g });
    if (r.ok) {
      const primo = (v) => String(v || '').trim().toLowerCase().split(/[\s-]+/)[0];
      nomi.forEach((x) => { if (primo(x.nome) === r.nome) x.g = r.g; });
      if (!nomi.some((x) => (x.g || '') === '')) pannelloAperto = false;
      vecchio('nomi-genere-', 'nomi-genere-m', 'nomi-genere-f'); disegnaNomi(); aggiorna();
    } else { b.disabled = false; alert(r.errore === 'pieno' ? 'elenco dei nomi pieno.' : 'non salvato: serve il codice del foglio nuovo (serata-28g) o il foglio non ha risposto.'); }
  });
  // incerti: un tocco e il nome (il primo, per tutti quelli che lo hanno) vale uomo o donna da adesso in poi
  $('lista-nomi').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-az="sesso"]');
    if (!b) return;
    b.disabled = true;
    const r = await api({ op: 'impostagenere', nome: b.dataset.nome, g: b.dataset.g });
    if (r.ok) {
      const primo = (v) => String(v || '').trim().toLowerCase().split(/[\s-]+/)[0];
      nomi = nomi.filter((x) => primo(x.nome) !== r.nome);
      vecchio('nomi-genere-', 'nomi-genere-m', 'nomi-genere-f'); disegnaNomi(); aggiorna();
    } else { b.disabled = false; alert(r.ok === false && r.errore === 'pieno' ? 'elenco dei nomi pieno.' : 'non salvato: ' + (r.errore === 'dati' ? 'nome non valido' : 'serve il codice del foglio nuovo (serata-28f) o il foglio non ha risposto') + '.'); }
  });
  $('lista-nomi').addEventListener('click', async (e) => {
    const b = e.target.closest('.az-el');
    if (!b) return;
    const id = b.dataset.id, annulla = b.dataset.az === 'annulla';
    if (!annulla && !b.dataset.ok) { chiediElimina = id; disegnaNomi(); clearTimeout(timerElimina); timerElimina = setTimeout(() => { chiediElimina = ''; disegnaNomi(); }, 5000); return; }
    clearTimeout(timerElimina); chiediElimina = '';
    eliminati.set(id, 'attesa'); disegnaNomi();
    const r = await api({ op: 'escludilista', id, annulla });
    if (r.ok && typeof r.eliminato === 'boolean') {
      if (r.eliminato) eliminati.set(id, 'fatto'); else eliminati.delete(id);
      vecchio('invii'); vecchiaLista();
    } else {
      if (annulla) eliminati.set(id, 'fatto'); else eliminati.delete(id);
      alert(r.ok ? 'serve il codice del foglio nuovo (tg-14).' : r.errore === 'pieno' ? 'non rimesso: la lista dei confermati è piena.'
        : r.errore === 'stato' || r.errore === 'persona' ? 'non fatto: ' + spiega(r, id) + '. ricarica l\'elenco.' : 'non salvato: il foglio non ha risposto (o la rete è caduta). riprova.');
    }
    disegnaNomi();
  });
  $('lista-nomi').addEventListener('click', async (e) => {
    const b = e.target.closest('.az-li');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.az === 'qrsub') {                       // invitato da poco: lo confermo dalla regia e mostro subito il QR
      if (window.zcPrecarica) zcPrecarica();
      const prima = fattiLista.get(id) || {};
      fattiLista.set(id, { attesa: true, leggo: true }); disegnaNomi();
      const c = await api({ op: 'confermalista', id });
      const r = c && c.ok && c.stato ? await api({ op: 'passlista', id }) : null;
      if (r && r.ok && r.pass) {
        fattiLista.set(id, { pass: r.pass, sms: r.sms });
        vecchio('invii'); vecchiaLista(); aggiorna();
        const x = nomi.find((y) => y.id === id) || {}; x.stato = 'confermato';
        mostraQrOspite({ nome: x.nome || '' }, { token: (r.pass.match(/[?&]t=([A-Za-z0-9]+)/) || [])[1] || '', pass: r.pass, sms: r.sms });
      } else {
        fattiLista.set(id, prima);
        alert(c && c.errore === 'pieno' ? 'non confermato: la lista dei confermati è piena.'
          : c && c.ok === false && (c.errore === 'stato' || c.errore === 'persona') ? 'non fatto: ' + spiega(c, id) + '. ricarica l\'elenco.'
          : 'non riuscito: il foglio non ha risposto (o la rete è caduta). riprova.');
      }
      disegnaNomi();
      return;
    }
    if (b.dataset.az === 'sms') {
      setTimeout(async () => {
        const f = fattiLista.get(id); if (!f) return;
        f.mandato = true; disegnaNomi();
        if (f.invito) { ricordaSegnato('invito', id, true); await api({ op: 'segna', tipo: 'invito', id, si: true }); vecchio('invii'); }   // come dal pannello SMS
      }, 400);
      return;
    }
    if (!b.dataset.ok) { chiediNome = id; disegnaNomi(); clearTimeout(timerNome); timerNome = setTimeout(() => { chiediNome = ''; disegnaNomi(); }, 5000); return; }
    clearTimeout(timerNome); chiediNome = '';
    fattiLista.set(id, { attesa: true, leggo: b.dataset.az === 'pass' }); disegnaNomi();
    if (b.dataset.az === 'pass') {
      const r = await api({ op: 'passlista', id });
      if (r.ok && r.pass) fattiLista.set(id, { pass: r.pass, sms: r.sms });
      else {
        fattiLista.delete(id);
        alert(r.ok ? 'serve il codice del foglio nuovo (tg-12).' : r.errore === 'stato' || r.errore === 'persona' ? 'nel foglio questa persona non risulta più confermata. ricarica l\'elenco.' : 'il foglio non ha risposto. riprova.');
      }
      disegnaNomi();
      return;
    }
    if (b.dataset.az === 'scegli') {
      const r = await api({ op: 'sceglilista', id });
      fattiLista.delete(id);
      const x = nomi.find((y) => y.id === id);
      if (r.ok && r.scelto) { if (x) x.stato = 'da invitare'; vecchiaLista(); }
      else alert(r.ok ? 'serve il codice del foglio nuovo (tg-8).' : r.errore === 'stato' || r.errore === 'persona' ? 'non fatto: ' + spiega(r, id) + '. ricarica l\'elenco.' : 'non salvato: il foglio non ha risposto (o la rete è caduta). riprova.');
      disegnaNomi();
      return;
    }
    const invita = b.dataset.az === 'invita';
    const r = await api({ op: invita ? 'invitalista' : 'confermalista', id });
    if (r.ok && r.stato && !!r.invito === invita) {
      fattiLista.set(id, { sms: r.sms, invito: invita, mandato: !!(r.sms && r.sms.mandato) });
      vecchio('invii');
      vecchiaLista();
      if (!invita) {                                      // confermato dalla regia: oltre a WhatsApp e SMS esce subito anche il QR
        if (window.zcPrecarica) zcPrecarica();
        const pr = await api({ op: 'passlista', id });
        if (pr && pr.ok && pr.pass) {
          fattiLista.set(id, { pass: pr.pass, sms: pr.sms || r.sms });
          const x = nomi.find((y) => y.id === id) || {};
          mostraQrOspite({ nome: x.nome || '' }, { token: (pr.pass.match(/[?&]t=([A-Za-z0-9]+)/) || [])[1] || '', pass: pr.pass, sms: pr.sms || r.sms });
        }
      }
    } else {
      fattiLista.delete(id);
      alert(r.ok ? 'serve il codice del foglio nuovo (tg-7).' : r.errore === 'pieno' ? 'non confermato: la lista dei confermati è piena.'
        : r.errore === 'stato' || r.errore === 'persona' ? 'non fatto: ' + spiega(r, id) + '. ricarica l\'elenco.'
        : 'non salvato: il foglio non ha risposto (o la rete è caduta). riprova.');
    }
    disegnaNomi();
  });
  // "da invitare": un tasto solo per invitarli tutti (poi a ognuno il suo SMS)
  let tuttiStato = '', timerTutti = 0;                    // '' | 'chiedi' | 'attesa'
  const daInvitare = () => nomi.filter((x) => x.id && x.stato === 'da invitare' && !fattiLista.has(x.id));
  const mostraTutti = () => {
    const b = $('invita-tutti'), n = daInvitare().length;
    const qui = tipoNomi === 'lista' && $('nomi-titolo').dataset.stati === 'da invitare';
    b.hidden = !(qui && (n > 0 || tuttiStato === 'attesa'));
    b.disabled = tuttiStato === 'attesa';
    b.className = 'spunta ' + (tuttiStato ? 'chiedi' : 'conferma');
    b.textContent = tuttiStato === 'attesa' ? 'invito tutti…' : tuttiStato === 'chiedi' ? 'inviti tutti e ' + n + '? ok' : 'invita tutti (' + n + ')';
  };
  $('invita-tutti').addEventListener('click', async () => {
    if (tuttiStato === 'attesa') return;
    if (tuttiStato !== 'chiedi') { tuttiStato = 'chiedi'; mostraTutti(); clearTimeout(timerTutti); timerTutti = setTimeout(() => { if (tuttiStato === 'chiedi') { tuttiStato = ''; mostraTutti(); } }, 5000); return; }
    clearTimeout(timerTutti); tuttiStato = 'attesa'; mostraTutti();
    const r = await api({ op: 'invitatutti' });
    tuttiStato = '';
    if (r.ok && r.tutti) {
      (r.invitati || []).forEach((p) => { if (p.id) fattiLista.set(p.id, { sms: p.sms, invito: true, mandato: !!(p.sms && p.sms.mandato) }); });
      vecchio('invii'); vecchiaLista();
    } else alert(r.ok ? 'serve il codice del foglio nuovo (tg-13).' : 'non riuscito: il foglio non ha risposto. controlla nel foglio prima di riprovare.');
    disegnaNomi();
  });
  const unisciBk = (n, b, i, stati) => {
    const chiave = (s) => String(s || '').toLowerCase().trim();
    const extra = new Map(n.persone.map((p) => [chiave(p.nome), p]));
    const sms = new Map(((i.ok && i.invii && sistemaInvii(i.invii).backstage) || []).map((x) => [x.id, x]));
    const tutti = b.persone.map((p) => {
      const e = extra.get(chiave(p.nome + ' ' + p.cognome)) || {};
      return { id: p.id, nome: p.nome + ' ' + p.cognome, stato: p.stato, eta: e.eta, g: e.g, tel: e.tel, ora: p.entrato, pagato: !!p.pagato, sms: sms.get(p.id) };
    });
    if (!mostrati) mostrati = new Set(tutti.filter((p) => stati.includes(p.stato)).map((p) => p.id));   // chi confermi resta in elenco
    nomi = tutti.filter((p) => mostrati.has(p.id)).sort((a, z) => a.nome.localeCompare(z.nome, 'it'));
    return true;
  };
  const caricaBkNomi = async (stati) => {
    const STATI = ['richiesta', 'confermato', 'entrato', 'annullato'];
    const gn = giaVisto('nomi-bk'), gb = giaVisto('backstage'), gi = giaVisto('invii');
    let mostrato = false;
    if (gn && gb) { unisciBk(gn, gb, gi || {}, stati); disegnaNomi(); mostrato = true; }   // subito gli ultimi dati
    const [n, b, i] = await Promise.all([scarica('nomi-bk', { op: 'nomi', tipo: 'backstage', stati: STATI }, 20000), scarica('backstage', { op: 'backstage' }, 20000), scarica('invii', { op: 'invii' }, 20000)]);
    if (!n.ok || !b.ok) return mostrato;
    const prima = new Map(nomi.map((x) => [x.id, x]));
    unisciBk(n, b, i, stati);
    nomi = nomi.map((x) => { const v = prima.get(x.id); return v && (v.attesa || v.stato !== x.stato && v.stato === 'confermato') ? v : x; });   // non tornare indietro su chi stai confermando
    disegnaNomi();
    return true;
  };
  $('lista-nomi').addEventListener('click', async (e) => {
    const b = e.target.closest('.az-bk');
    if (!b) return;
    const id = b.dataset.id, x = nomi.find((y) => y.id === id);
    if (!x) return;
    if (b.dataset.az === 'sms') { setTimeout(async () => { x.sms.mandato = true; ricordaSegnato('backstage', id, true); disegnaNomi(); await api({ op: 'segna', tipo: 'backstage', id, si: true }); vecchio('invii'); }, 400); return; }
    if (!b.dataset.ok) { chiediNome = id; disegnaNomi(); clearTimeout(timerNome); timerNome = setTimeout(() => { chiediNome = ''; disegnaNomi(); }, 5000); return; }
    clearTimeout(timerNome); chiediNome = '';
    x.stato = 'confermato'; x.attesa = true; disegnaNomi();      // subito a schermo, il foglio si aggiorna dietro
    const r = await api({ op: 'conferma', id, si: true });
    if (!r.ok) { x.stato = 'richiesta'; x.attesa = false; disegnaNomi(); return alert('non salvato: il foglio non ha risposto (o la rete è caduta). riprova.'); }
    vecchio('nomi-bk', 'backstage');
    const i = inVolo.invii ? await inVolo.invii.then(() => scarica('invii', { op: 'invii' })) : await scarica('invii', { op: 'invii' });   // solo il testo dell'SMS con il pass
    x.sms = i.ok && i.invii ? (sistemaInvii(i.invii).backstage || []).find((y) => y.id === id) : null;
    x.attesa = false; disegnaNomi();
  });

  // ospite aggiunto a mano: già confermato, il QR si vede subito e il pass (la foto da salvare e mandare) si prepara qui, uguale a quello che vede l'invitato
  let fotoOspite = null;
  const mostraQrOspite = (p, r) => {
    fotoOspite = null;
    $('oq-nome').textContent = maiuscole(p.nome);
    $('oq-foto').hidden = true; $('oq-foto').removeAttribute('src'); $('oq-tieni').hidden = true; $('oq-salva').hidden = true; $('oq-copiafoto').hidden = true;
    $('oq-qr').hidden = false; $('oq-sotto').hidden = false;
    try { const q = qrcode(0, 'M'); q.addData(r.token); q.make(); $('oq-qr').innerHTML = q.createSvgTag(6, 0); } catch (e) { $('oq-qr').textContent = r.pass; }
    $('oq-invii').innerHTML = r.sms && r.sms.tel ? dueInvii('', '', r.sms.tel, r.sms.testo) : '<span class="piccoli">senza numero: salva il pass e mandaglielo tu, o copia il link.</span>';
    $('oq-copia').dataset.link = r.pass || '';
    $('ospite-qr').hidden = false;
    const nomeFile = (p.staff ? 'zonacalda-staff-' : 'zonacalda-invito-') + String(p.nome || 'ospite').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
    if (!window.zcPass) return;
    zcPass({ token: r.token, nome: p.nome, staff: !!p.staff }).then((foto) => {
      if ($('ospite-qr').hidden || $('oq-nome').textContent !== maiuscole(p.nome)) return;       // nel frattempo l'hai chiusa o ne hai aggiunto un altro
      fotoOspite = foto;
      $('oq-foto').src = URL.createObjectURL(foto); $('oq-foto').hidden = false; $('oq-qr').hidden = true; $('oq-sotto').hidden = true;
      $('oq-tieni').hidden = false; $('oq-salva').hidden = false;
      $('oq-salva').onclick = () => zcSalvaPass(foto, nomeFile);
      if (navigator.clipboard && window.ClipboardItem && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        $('oq-copiafoto').hidden = false;
        $('oq-copiafoto').onclick = async () => { $('oq-copiafoto').textContent = (await zcCopiaPass(foto)) ? 'copiata: incollala nella chat' : 'non riesco: usa "salva il pass"'; };
      }
    }).catch((e) => console.error('pass ospite', e));        // se non riesce resta il QR a schermo
  };
  $('oq-chiudi').addEventListener('click', () => { $('ospite-qr').hidden = true; $('oq-qr').innerHTML = ''; fotoOspite = null; });
  $('oq-copia').addEventListener('click', async () => { const l = $('oq-copia').dataset.link; try { await navigator.clipboard.writeText(l); $('oq-copia').textContent = 'copiato ✓'; setTimeout(() => { $('oq-copia').textContent = 'copia il link'; }, 1500); } catch (e) { prompt('copia il link:', l); } });
  // "+" in "invitati, non confermati": un amico che si aggiunge all'ultimo. nome e cognome bastano
  $('piu-nomi').addEventListener('click', () => {
    if (window.zcPrecarica) zcPrecarica();                 // font e logo del pass si caricano già adesso
    const f = $('f-piu'); f.hidden = !f.hidden; metti('err-piu', '');
    const st = tipoNomi === 'staff';                       // nello staff bastano nome, cognome e (se c'è) il numero
    f.elements.eta.hidden = st; f.elements.email.hidden = st; metti('testo-piu', st ? 'una persona dello staff che aggiungi a mano: è subito registrata e ti do il suo pass con il QR. bastano nome e cognome.' : 'un ospite che aggiungi a mano: entra già confermato e ti do subito il QR. bastano nome e cognome.');
    if (!f.hidden) { f.scrollIntoView({ block: 'center' }); f.elements.nome.focus(); }
  });
  $('annulla-piu').addEventListener('click', () => { $('f-piu').hidden = true; $('f-piu').reset(); metti('err-piu', ''); });
  const ERRORI_PIU = { pieno: 'la lista dei confermati è piena: non aggiunto.', campi: 'servono nome e cognome.', telefono: 'il numero non sembra giusto: controllalo o lascialo vuoto.', email: 'la mail non sembra giusta: controllala o lasciala vuota.', non_abilitato: 'manca il foglio "staff": usa Prepara il foglio.', eta: 'l\'età deve essere un numero tra 14 e 99, o vuota.' };
  let salvandoPiu = false;
  $('f-piu').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (salvandoPiu) return;
    const f = $('f-piu'), v = (k) => f.elements[k].value.trim();
    if (!v('nome') || !v('cognome')) return metti('err-piu', ERRORI_PIU.campi);
    metti('err-piu', ''); salvandoPiu = true; $('invia-piu').disabled = true; metti('invia-piu', 'aggiungo…');
    const staff = tipoNomi === 'staff';
    const dati = staff ? { op: 'aggiungistaff', nome: v('nome'), cognome: v('cognome'), telefono: v('telefono') } : { op: 'aggiungilista', nome: v('nome'), cognome: v('cognome'), telefono: v('telefono'), eta: v('eta'), email: v('email') };
    let r = await api(dati);
    if (r && r.errore === 'esiste' && confirm(r.nome + ' è già nel foglio (' + r.stato + '). lo aggiungo lo stesso?')) r = await api(Object.assign({ forza: true }, dati));
    salvandoPiu = false; $('invia-piu').disabled = false; metti('invia-piu', 'aggiungi');
    if (r && r.ok && r.aggiunto) {
      const p = r.persona; aggiunti.add(p.id); ultimoAggiunto = p.id;
      if (p.staff) { if ($('nomi-titolo').dataset.stati === 'registrato') nomi.push(p); }                     // compare tra i registrati, da entrare
      else if (p.stato === 'confermato' && $('nomi-titolo').dataset.stati === 'confermato') nomi.push(p);           // compare tra i confermati
      else if (p.stato !== 'confermato' && $('nomi-titolo').dataset.stati === 'invitato') nomi.push(p);
      if (r.token) mostraQrOspite(p, r);
      f.reset(); f.hidden = true; $('q-nomi').value = '';
      vecchiaLista(); vecchio('invii'); if (p.staff) { vecchio('nomi-staff-registrato', 'nomi-staff-entrato'); caricaInviiStaff(); } aggiorna();
      disegnaNomi();
      const li = document.querySelector('#lista-nomi li.nuovo'); if (li) li.scrollIntoView({ block: 'center' });
    } else if (r && r.errore === 'esiste') metti('err-piu', 'già nel foglio: non aggiunto.');
    else if (r && ERRORI_PIU[r.errore]) metti('err-piu', ERRORI_PIU[r.errore]);
    else if (r && r.ok) metti('err-piu', 'serve il codice del foglio nuovo (regia-3).');
    else metti('err-piu', 'il foglio non ha risposto: controlla nel foglio prima di riprovare.');
  });

  // staff contato a mano: si vede in "staff · entrati"
  let mano = 0, manoInVolo = 0;
  const mostraMano = () => { metti('mano-n', mano); };
  const cambiaMano = async (d) => {
    if (d < 0 && mano <= 0) return;
    mano += d; manoInVolo++; mostraMano();
    const r = await api({ op: 'staffmano', delta: d });
    manoInVolo--;
    if (r.ok && typeof r.aMano === 'number') { if (!manoInVolo) { mano = r.aMano; mostraMano(); } aggiorna(); }
    else if (r.ok) { mano -= d; mostraMano(); alert('serve il codice del foglio nuovo (nomi-5).'); }
    else { mano -= d; mostraMano(); alert('non salvato: il foglio non ha risposto (o la rete è caduta). riprova.'); }
  };
  // staff · entrati: tutti gli ingressi dello staff a zero (col pass e contati a mano), con doppia conferma
  let azzeraStato = '', timerAzzera = 0;
  const mostraAzzera = () => {
    const b = $('azzera-staff');
    b.disabled = azzeraStato === 'attesa';
    b.style.background = azzeraStato === 'chiedi' ? '#3a0d11' : 'transparent';
    b.style.color = azzeraStato === 'chiedi' ? '#fff' : '#ff8088';
    b.textContent = azzeraStato === 'attesa' ? 'azzero…' : azzeraStato === 'chiedi' ? 'sicuro? tutti gli ingressi staff a 0: ok' : 'azzera gli ingressi dello staff';
  };
  $('azzera-staff').addEventListener('click', async () => {
    if (azzeraStato === 'attesa') return;
    if (azzeraStato !== 'chiedi') { azzeraStato = 'chiedi'; mostraAzzera(); clearTimeout(timerAzzera); timerAzzera = setTimeout(() => { if (azzeraStato === 'chiedi') { azzeraStato = ''; mostraAzzera(); } }, 5000); return; }
    clearTimeout(timerAzzera); azzeraStato = 'attesa'; mostraAzzera();
    const r = await api({ op: 'azzerastaff' });
    azzeraStato = ''; mostraAzzera();
    if (r.ok && typeof r.azzerati === 'number') {
      mano = 0; mostraMano(); nomi = []; disegnaNomi();
      vecchio('nomi-staff-entrato', 'nomi-staff-registrato', 'invii'); aggiorna();
      alert('fatto: ingressi dello staff a 0 (' + r.azzerati + ' col pass, contati a mano azzerati). righe del foglio di nuovo bianche: i pass risultano da mandare.');
    } else alert(r.ok ? 'serve il codice del foglio nuovo (brevo-3).' : 'non riuscito: il foglio non ha risposto. riprova.');
  });
  $('mano-piu').addEventListener('click', () => cambiaMano(1));
  $('mano-meno').addEventListener('click', () => cambiaMano(-1));

  const apriNomi = async (el) => {
    tipoNomi = el.dataset.tipo; gNomi = el.dataset.g || ''; pannelloAperto = false;
    $('mano').hidden = !(tipoNomi === 'staff' && el.dataset.stati === 'entrato');
    $('azzera-staff').hidden = $('mano').hidden; azzeraStato = ''; mostraAzzera();
    $('barra-nomi').hidden = tipoNomi !== 'lista'; impostaOrdine();                       // pista: ordine a–z / cronologico
    $('piu-nomi').hidden = !((tipoNomi === 'lista' && (el.dataset.stati === 'invitato' || el.dataset.stati === 'confermato')) || tipoNomi === 'staff');     // "+" in "invitati" e in "confermati": l'ospite aggiunto è già confermato
    $('f-piu').hidden = true; $('f-piu').reset(); metti('err-piu', ''); ultimoAggiunto = '';
    if (!$('mano').hidden) { const d = mem.leggi('zc-regia-dati'); mano = (d && d.staff && d.staff.aMano) || 0; mostraMano(); }
    metti('nomi-titolo', el.dataset.titolo); $('nomi-titolo').dataset.stati = el.dataset.stati || '';
    $('q-nomi').value = ''; nomi = []; $('lista-nomi').innerHTML = '<li>carico…</li>'; metti('nomi-conto', ''); $('nomi-pubblico').hidden = true; $('assegna-qui').hidden = true; $('pannello-assegna').hidden = true; tuttiStato = ''; $('invita-tutti').hidden = true;
    $('pannello').hidden = true; $('vista-nomi').hidden = false; window.scrollTo(0, 0);
    if (tipoNomi === 'backstage') {
      mostrati = null; chiediNome = '';
      if (!(await caricaBkNomi((el.dataset.stati || '').split(',')))) $('lista-nomi').innerHTML = '<li>il foglio non ha risposto. riprova.</li>';
      return;
    }
    if (tipoNomi === 'staff') caricaInviiStaff();
    const ch = 'nomi-' + tipoNomi + '-' + (el.dataset.stati || el.dataset.g || '');
    const g = giaVisto(ch);
    if (g && g.persone) { nomi = g.persone; disegnaNomi(); }
    const r = await scarica(ch, { op: 'nomi', tipo: tipoNomi, stati: (el.dataset.stati || '').split(','), g: el.dataset.g });
    if (r.ok) {
      if (tipoNomi === el.dataset.tipo && $('nomi-titolo').dataset.stati === (el.dataset.stati || '')) {
        const stati = (el.dataset.stati || '').split(',');
        const tenuti = nomi.filter((x) => x.id && (fattiLista.has(x.id) || eliminati.has(x.id) || aggiunti.has(x.id) || !stati.includes(x.stato)) && !r.persone.some((y) => y.id === x.id));   // chi hai appena confermato resta finché non esci
        nomi = r.persone.concat(tenuti).sort((a, z) => String(a.nome).localeCompare(String(z.nome), 'it')); disegnaNomi();
      }
    } else if (!g) $('lista-nomi').innerHTML = '<li>il foglio non ha risposto. riprova.</li>';
  };
  $('vedi-incerti').addEventListener('click', () => apriNomi($('vedi-incerti')));
  document.querySelectorAll('.n.apre').forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); apriNomi(el); });   // dentro il blocco backstage non apre l'elenco pagamenti
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); apriNomi(el); } });
  });
  $('q-nomi').addEventListener('input', disegnaNomi);
  $('chiudi-nomi').addEventListener('click', () => { fattiLista.clear(); eliminati.clear(); aggiunti.clear(); ultimoAggiunto = ''; $('vista-nomi').hidden = true; $('pannello').hidden = false; aggiorna(); });

  const entra = async () => {
    const r = await aggiorna();
    if (!r.ok) {
      metti('err-pin', r.errore === 'bloccato' ? 'troppi tentativi. riprova tra 10 minuti.'
        : r.errore === 'pin' ? 'PIN sbagliato.' : r.errore === 'non_attivo' ? 'sistema non ancora collegato.' : 'il foglio non ha risposto. riprova.');
      return;
    }
    mem.scrivi('zc-regia-accesso', { pin, s: sessione, scade: Date.now() + ORE_ACCESSO * 3600e3 });
    apri();
  };
  const apri = () => {
    $('accesso').hidden = true; $('pannello').hidden = false;
    document.documentElement.classList.remove('dentro');   // da qui in poi decide lo script
    clearInterval(giro); giro = setInterval(aggiorna, 15000);
    setTimeout(precarica, 1500); clearInterval(apri.p); apri.p = setInterval(precarica, 60000);
  };
  const esci = () => {
    clearInterval(giro);
    mem.togli('zc-regia-accesso'); mem.togli('zc-regia-dati');
    try { Object.keys(localStorage).filter((k) => k.startsWith('zc-regia-')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* niente */ }   // anche nomi e numeri salvati sul telefono
    clearInterval(apri.p);
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
