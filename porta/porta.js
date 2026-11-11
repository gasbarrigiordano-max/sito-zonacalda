// Zonacalda — porta.
// Veloce: l'elenco degli invitati sta sul telefono (si aggiorna ogni 20 s), la scansione cerca lì;
// "fai entrare" è immediato e il salvataggio sul foglio parte in sottofondo, con nuovi tentativi se manca la rete.
(() => {
  const ETA_MINIMA = 23;
  const $ = (id) => document.getElementById(id);
  let pin = '';
  try { pin = sessionStorage.getItem('zc-pin') || ''; } catch (e) { /* niente */ }
  let stream = null, scansione = false, ultimo = '', vistoQr = 0, wake = null;

  // memoria del telefono: resiste a ricarica, schermo bloccato, batteria che si spegne
  const mem = {
    leggi: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    scrivi: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o negata */ } },
    togli: (k) => { try { localStorage.removeItem(k); } catch (e) { /* niente */ } },
  };
  let sessione = (mem.leggi('zc-porta-sessione') || {}).s || '';
  const api = async (dati) => {
    const r = await zcApi({ azione: 'porta', pin, sessione, ...dati });
    if (r && r.sessione) { sessione = r.sessione; mem.scrivi('zc-porta-sessione', { s: sessione }); }
    return r;
  };
  const vibra = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* niente */ } };
  const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------ stato locale
  const perToken = new Map();      // token → persona
  const perId = new Map();         // id → persona
  const entratiQui = new Map();    // id → ora (entrati da questo telefono, anche se non ancora salvati)
  let elencoPronto = false;
  let server = null;               // ultimi conteggi del foglio
  let staffQui = 0;                // staff +/- non ancora salvato
  const coda = [];                 // ingressi da salvare: { id, forza, staff }
  let avvisoCoda = '';
  // quello che non è ancora sul foglio resta nella memoria del telefono finché non è salvato
  const ricorda = () => mem.scrivi('zc-porta-coda', { coda, staffQui, entrati: [...entratiQui] });
  {
    const m = mem.leggi('zc-porta-coda');
    if (m && Array.isArray(m.coda)) {
      coda.push(...m.coda); staffQui = Number(m.staffQui) || 0;
      (m.entrati || []).forEach(([id, ora]) => entratiQui.set(id, ora));
    }
  }

  const ora = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  const impronta = async (t) => {               // il PIN non si salva: solo la sua impronta, per riconoscerlo senza rete
    try { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('zonacalda|' + t)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return ''; }
  };
  const caricaElenco = (persone) => {
    perToken.clear(); perId.clear();
    for (const p of persone) {
      if (entratiQui.has(p.id) && p.stato !== 'entrato') { p.stato = 'entrato'; p.entrato = entratiQui.get(p.id); }
      perToken.set(p.token, p); perId.set(p.id, p);
    }
    elencoPronto = true;
  };

  // ------------------------------------------------ conteggi (foglio + quello che non è ancora salvato)
  const mostraConteggi = () => {
    if (!server) return;
    const inAttesa = coda.length;
    const staffInAttesa = coda.filter((x) => x.staff).length;
    const ospiti = server.ospiti + inAttesa - staffInAttesa;
    const staff = Math.max(0, server.staff + staffQui) + staffInAttesa;
    const dentro = ospiti + staff;
    $('dentro').textContent = dentro;
    $('capienza').textContent = server.capienza;
    $('dettaglio').textContent = `ospiti ${ospiti} · staff ${staff} · attesi ${Math.max(0, server.attesi - (inAttesa - staffInAttesa))}`;
    $('avviso-0030').hidden = !(server.garantitoFino && new Date() >= new Date(server.garantitoFino));
    $('dentro').style.color = dentro >= server.capienza ? 'var(--rosso)' : '';
    $('sync').textContent = inAttesa || staffQui ? `⏳ da salvare: ${inAttesa + Math.abs(staffQui)}` : (avvisoCoda || '');
    $('sync').style.color = inAttesa || staffQui ? '#ffcf7a' : '';
  };
  const conteggi = (c) => { if (c) { server = c; mostraConteggi(); } };
  const dopo0030 = () => !$('avviso-0030').hidden;

  // ------------------------------------------------ salvataggi in sottofondo
  let salvando = false;
  const salva = async () => {
    if (salvando) return;
    salvando = true;
    try { await ciclo(); } catch (e) { console.error('salvataggio', e); }
    salvando = false;
    mostraConteggi();
    if ((coda.length || staffQui) && !pinBloccato) setTimeout(salva, 3000);   // qualcosa è rimasto: si riprova
  };
  const ciclo = async () => {
    let attesaRete = 1000;
    while (coda.length || staffQui) {
      if (staffQui) {
        const delta = staffQui > 0 ? 1 : -1;
        const r = await api({ op: 'staff', delta });
        if (r.ok) { staffQui -= delta; ricorda(); conteggi(r.conteggi); attesaRete = 1000; continue; }
      } else {
        const { id, forza } = coda[0];
        const r = await api({ op: 'entra', id, forza });
        if (r.errore === 'pin' || r.errore === 'bloccato') { pinBloccato = true; avvisoCoda = '⚠︎ PIN cambiato: esci e rientra'; }
        if (r.ok || r.errore === 'gia_entrato' || r.errore === 'pieno' || r.errore === 'persona' || r.errore === 'non_confermato') {
          coda.shift(); ricorda();
          if (r.errore === 'gia_entrato') avvisoCoda = `⚠︎ ${r.persona ? r.persona.nome : ''} risultava già entrato`;
          else if (r.errore === 'pieno') avvisoCoda = '⚠︎ il foglio dice sala piena';
          else avvisoCoda = '';
          if (r.conteggi) conteggi(r.conteggi); else mostraConteggi();
          attesaRete = 1000;
          continue;
        }
      }
      if (r_bloccato()) break;
      await attendi(attesaRete);                     // niente rete: riprova tra poco, sempre più piano
      attesaRete = Math.min(attesaRete * 2, 15000);
    }
  };
  let pinBloccato = false;
  const r_bloccato = () => pinBloccato;

  // ------------------------------------------------ aggiornamento periodico
  const aggiorna = async () => {
    const r = await api({ op: 'elenco' });
    if (!r.ok) { if ((r.errore === 'pin' || r.errore === 'bloccato') && !$('lavoro').hidden) pinBloccato = true; return r; }
    pinBloccato = false;                             // PIN accettato: si riprende a salvare
    if (Array.isArray(r.persone)) {
      caricaElenco(r.persone);
      impronta(pin).then((h) => mem.scrivi('zc-porta-elenco', { h, persone: r.persone, conteggi: r.conteggi, quando: Date.now() }));
    }
    conteggi(r.conteggi);
    return r;
  };

  // ------------------------------------------------ chi è entrato dagli altri telefoni (ogni 3 secondi, richiesta leggera)
  let novitaDa = 0;
  const novita = async () => {
    if (pinBloccato) return setTimeout(novita, 3000);
    const r = await api({ op: 'novita', da: novitaDa });
    if (r.ok && Array.isArray(r.entrati)) {
      for (const [id, ora, t] of r.entrati) {
        const p = perId.get(id);
        if (p && p.stato !== 'entrato') { p.stato = 'entrato'; p.entrato = ora; }
        novitaDa = Math.max(novitaDa, t);
      }
    }
    setTimeout(novita, r.ok ? 3000 : 5000);
  };

  // ------------------------------------------------ accesso
  const entra = async () => {
    let r = await aggiorna();
    if (!r.ok && r.errore === 'rete') {              // niente rete: si parte con l'ultimo elenco salvato su questo telefono
      const m = mem.leggi('zc-porta-elenco');
      if (m && m.h && m.h === await impronta(pin) && Date.now() - m.quando < 24 * 3600e3) {
        caricaElenco(m.persone); conteggi(m.conteggi);
        avvisoCoda = '⚠︎ senza rete: elenco delle ' + new Date(m.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        r = { ok: true };
      }
    }
    if (!r.ok) {
      $('err-pin').textContent = r.errore === 'bloccato' ? 'troppi tentativi. riprova tra 10 minuti.'
        : r.errore === 'pin' ? 'PIN sbagliato.' : r.errore === 'non_attivo' ? 'sistema non ancora collegato.' : 'nessuna connessione. riprova.';
      return false;
    }
    try { sessionStorage.setItem('zc-pin', pin); } catch (e) { /* niente */ }
    $('accesso').hidden = true; $('lavoro').hidden = false;
    try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* non supportato */ }
    setInterval(() => { if (!salvando) aggiorna(); }, 20000);
    novita();
    if (coda.length || staffQui) { mostraConteggi(); salva(); }   // ingressi rimasti da prima della ricarica
    return true;
  };
  $('f-pin').addEventListener('submit', async (e) => {
    e.preventDefault();
    pin = e.target.pin.value.trim();
    await entra();
  });
  if (pin) entra();
  $('esci').addEventListener('click', () => {
    if (coda.length && !confirm(`ci sono ${coda.length} ingressi non ancora salvati. uscire lo stesso?`)) return;
    try { sessionStorage.removeItem('zc-pin'); } catch (e) { /* niente */ }
    mem.togli('zc-porta-sessione'); mem.togli('zc-porta-elenco');
    if (!coda.length && !staffQui) mem.togli('zc-porta-coda');
    location.reload();
  });
  addEventListener('beforeunload', (e) => { if (coda.length) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && wake) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ } }
  });

  // ------------------------------------------------ date ed età
  const SERATA = new Date(2026, 10, 14);
  const leggiData = (v) => {
    const s = String(v || '');
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    // "Fri Feb 02 2001 00:00:00 GMT+0100 (…)": come la manda il foglio quando trasforma il testo in data
    const mesi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const e = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s+(\d{4})/i);
    if (e) return new Date(+e[3], mesi.indexOf(e[1].toLowerCase()), +e[2]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };
  const etaAl = (d) => SERATA.getFullYear() - d.getFullYear() - ((SERATA.getMonth() < d.getMonth() || (SERATA.getMonth() === d.getMonth() && SERATA.getDate() < d.getDate())) ? 1 : 0);
  const maiuscole = (s) => String(s || '').toLocaleLowerCase('it').replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('it'));

  // ------------------------------------------------ scheda persona
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let chiudi = 0;

  const scheda = (p) => {
    const box = $('scheda');
    clearTimeout(chiudi);
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
    if (!p) {
      box.className = 'scheda no';
      box.innerHTML = '<p class="grosso">QR NON VALIDO</p><p>non è un invito zonacalda.</p>';
      vibra([80, 60, 80]);
      return;
    }
    if (p.tipo === 'backstage') {                        // pass d'oro: entra a qualunque ora, dopo la conferma
      const nb = leggiData(p.nascita), eb = nb ? etaAl(nb) : null;
      const chi = `<h2>${esc(maiuscole(p.nome))} ${esc(maiuscole(p.cognome))}</h2><p>${eb === null ? '' : eb + ' anni · '}backstage</p>`;
      if (p.stato === 'entrato') {
        box.className = 'scheda no';
        box.innerHTML = `<p class="grosso">BACKSTAGE GIÀ ENTRATO${p.entrato ? ' ALLE ' + esc(p.entrato) : ''}</p>${chi}<p>lo stesso pass non vale due volte.</p>`;
        vibra([80, 60, 80]); return;
      }
      if (p.stato !== 'confermato') {
        box.className = 'scheda no';
        box.innerHTML = `<p class="grosso">PASS BACKSTAGE NON VALIDO · ${esc(String(p.stato || '').toUpperCase())}</p>${chi}`;
        vibra([80, 60, 80]); return;
      }
      box.className = 'scheda ok oro';
      box.innerHTML = `<p class="grosso">OK · BACKSTAGE ★</p>${chi}<p style="color:var(--tenue);font-size:.85rem">controlla il documento: nome e data di nascita. accompagnalo dietro la console.</p><button class="bottone" data-entra="${esc(p.id)}">fai entrare ✓</button>`;
      vibra(60); return;
    }
    if (p.tipo === 'staff') {                            // pass staff: niente età, niente orari
      const chi = `<h2>${esc(maiuscole(p.nome))} ${esc(maiuscole(p.cognome))}</h2>`;
      if (p.stato === 'entrato') {
        box.className = 'scheda no';
        box.innerHTML = `<p class="grosso">STAFF GIÀ ENTRATO${p.entrato ? ' ALLE ' + esc(p.entrato) : ''}</p>${chi}<p>lo stesso pass non vale due volte.</p>`;
        vibra([80, 60, 80]); return;
      }
      if (p.stato !== 'registrato') {
        box.className = 'scheda no';
        box.innerHTML = `<p class="grosso">PASS STAFF NON VALIDO</p>${chi}`;
        vibra([80, 60, 80]); return;
      }
      box.className = 'scheda ok';
      box.innerHTML = `<p class="grosso">OK · STAFF</p>${chi}<p style="color:var(--tenue);font-size:.85rem">controlla il documento: nome e cognome.</p><button class="bottone" data-entra="${esc(p.id)}">fai entrare ✓</button>`;
      vibra(60); return;
    }
    const nascita = leggiData(p.nascita);
    const eta = nascita ? etaAl(nascita) : null;
    const quando = nascita ? nascita.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'data non leggibile';
    const nomeHtml = `<h2>${esc(maiuscole(p.nome))} ${esc(maiuscole(p.cognome))}</h2><p>${eta === null ? '' : eta + ' anni · '}nato/a il ${esc(quando)}</p>`;
    const ctrl = '<p style="color:var(--tenue);font-size:.85rem">controlla il documento: nome e data di nascita.</p>';
    if (eta === null && p.stato === 'confermato') {
      box.className = 'scheda forse';
      box.innerHTML = `<p class="grosso">CONTROLLA L'ETÀ SUL DOCUMENTO</p>${nomeHtml}${ctrl}<button class="bottone" data-entra="${esc(p.id)}">ha più di ${ETA_MINIMA} anni: fai entrare</button>`;
      vibra([80, 60, 80]); return;
    }
    if (eta !== null && eta < ETA_MINIMA) {
      // l'invito lo decide l'organizzatore: alla porta è un avviso, non un blocco
      if (p.stato !== 'confermato') {
        box.className = 'scheda no';
        box.innerHTML = `<p class="grosso">NO · MENO DI ${ETA_MINIMA} ANNI · NON CONFERMATO</p>${nomeHtml}`;
        vibra([80, 60, 80]); return;
      }
      box.className = 'scheda forse';
      box.innerHTML = `<p class="grosso">ATTENZIONE · MENO DI ${ETA_MINIMA} ANNI</p>${nomeHtml}<p>ha un invito confermato.</p>${ctrl}<button class="bottone" data-entra="${esc(p.id)}">fai entrare comunque</button>`;
      vibra([80, 60, 80]); return;
    }
    if (p.stato === 'entrato') {
      box.className = 'scheda no';
      box.innerHTML = `<p class="grosso">GIÀ ENTRATO${p.entrato ? ' ALLE ' + esc(p.entrato) : ''}</p>${nomeHtml}<p>lo stesso invito non vale due volte.</p>`;
      vibra([80, 60, 80]); return;
    }
    if (p.stato === 'confermato') {
      box.className = 'scheda ok';
      box.innerHTML = `<p class="grosso">OK · INVITO CONFERMATO</p>${nomeHtml}${ctrl}<button class="bottone" data-entra="${esc(p.id)}">fai entrare ✓</button>`;
      vibra(60); return;
    }
    box.className = 'scheda forse';
    box.innerHTML = `<p class="grosso">NON CONFERMATO · ${esc(String(p.stato).toUpperCase())}</p>${nomeHtml}` +
      (dopo0030()
        ? `${ctrl}<p>dopo le 00:30 può entrare se c'è posto.</p><button class="bottone" data-entra="${esc(p.id)}" data-forza="1">fai entrare comunque</button>`
        : '<p>prima delle 00:30 entra solo chi ha confermato.</p>');
    vibra([80, 60, 80]);
  };

  // "fai entrare": subito, senza aspettare il foglio
  $('scheda').addEventListener('click', (e) => {
    const b = e.target.closest('[data-entra]');
    if (!b) return;
    const id = b.dataset.entra;
    if (server && server.ospiti + coda.length + Math.max(0, server.staff + staffQui) >= server.capienza) {
      const box = $('scheda'); box.className = 'scheda no';
      box.innerHTML = '<p class="grosso">SALA PIENA</p><p>aspetta che esca qualcuno.</p>';
      return;
    }
    const p = perId.get(id) || { id, nome: '', cognome: '' };
    const quando = ora();
    entratiQui.set(id, quando);
    p.stato = 'entrato'; p.entrato = quando;
    coda.push({ id, forza: !!b.dataset.forza, staff: p.tipo === 'staff' });
    ricorda();
    mostraConteggi();
    salva();
    const box = $('scheda');
    box.className = 'scheda ok';
    box.innerHTML = `<p class="grosso">DENTRO ✓</p><h2>${esc(maiuscole(p.nome))} ${esc(maiuscole(p.cognome))}</h2>`;
    vibra(120);
    clearTimeout(chiudi);
    chiudi = setTimeout(() => { box.hidden = true; }, 350);        // via subito: pronti per il prossimo QR
    if (!$('cerca').hidden) { $('q').value = ''; $('risultati').innerHTML = ''; $('q').focus(); }
  });

  // ------------------------------------------------ fotocamera (resta sempre accesa)
  const tokenDa = (testo) => {
    const m = String(testo).match(/[?&]t=([A-Za-z0-9]{20,40})/);
    if (m) return m[1];
    return /^[A-Za-z0-9]{20,40}$/.test(testo) ? testo : '';
  };

  const mostraToken = async (tok) => {
    const locale = perToken.get(tok);
    if (locale) return scheda(locale);
    // non è nell'elenco del telefono (script vecchio, o invito confermato negli ultimi secondi): chiedo al foglio
    $('scan-msg').textContent = 'controllo…';
    const r = await api({ op: 'qr', token: tok });
    $('scan-msg').textContent = 'inquadra il QR dell\'invito';
    conteggi(r.conteggi);
    if (r.ok) {
      if (r.persona) {
        r.persona.token = tok;
        if (entratiQui.has(r.persona.id)) { r.persona.stato = 'entrato'; r.persona.entrato = entratiQui.get(r.persona.id); }
        perToken.set(tok, r.persona); perId.set(r.persona.id, r.persona);
      }
      scheda(r.persona);
    } else {                                             // errore di rete o del foglio: non è un QR falso
      const box = $('scheda'); box.hidden = false; box.className = 'scheda forse';
      box.innerHTML = '<p class="grosso">ERRORE DI CONNESSIONE</p><p>riprova tra un attimo, oppure usa "cerca nome".</p>';
      ultimo = '';
    }
  };

  const ferma = () => {
    scansione = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('scan').hidden = true;
  };

  const avvia = async () => {
    $('cerca').hidden = true; $('scheda').hidden = true; ultimo = '';
    $('scan').hidden = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      $('scan-msg').textContent = 'fotocamera non disponibile: consenti l\'accesso o usa "cerca nome".';
      return;
    }
    const v = $('video');
    v.srcObject = stream;
    await v.play();
    scansione = true;
    const c = document.createElement('canvas');
    const g = c.getContext('2d', { willReadFrequently: true });
    const giro = () => {
      if (!scansione) return;
      if (v.readyState >= 2) {
        const lato = Math.min(v.videoWidth, v.videoHeight);
        const S = 480;
        c.width = S; c.height = S;
        g.drawImage(v, (v.videoWidth - lato) / 2, (v.videoHeight - lato) / 2, lato, lato, 0, 0, S, S);
        const qr = jsQR(g.getImageData(0, 0, S, S).data, S, S, { inversionAttempts: 'dontInvert' });
        if (qr && qr.data) {
          vistoQr = Date.now();
          if (qr.data !== ultimo) {                       // un QR nuovo sostituisce subito la scheda
            ultimo = qr.data;
            const tok = tokenDa(qr.data);
            if (!tok) scheda(null); else mostraToken(tok);
          }
        } else if (ultimo && Date.now() - vistoQr > 1200) {
          ultimo = '';                                    // il QR è uscito dall'inquadratura: lo stesso si può rileggere
        }
      }
      setTimeout(() => requestAnimationFrame(giro), 90);
    };
    giro();
  };

  $('b-scan').addEventListener('click', () => (scansione ? ferma() : avvia()));

  // ------------------------------------------------ ricerca per nome (sul telefono)
  let attesa = 0;
  $('b-cerca').addEventListener('click', () => {
    ferma();
    $('scheda').hidden = true;
    $('cerca').hidden = !$('cerca').hidden;
    if (!$('cerca').hidden) $('q').focus();
  });
  const elencaRisultati = (persone) => {
    const ul = $('risultati');
    ul.innerHTML = persone.length ? '' : '<li><small>nessuno con questo nome.</small></li>';
    persone.forEach((p) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      const dn = leggiData(p.nascita);
      b.innerHTML = `${esc(maiuscole(p.nome))} ${esc(maiuscole(p.cognome))} <small>· ${p.tipo === 'staff' ? 'staff · ' : ''}${dn ? etaAl(dn) + ' anni · ' : ''}${esc(p.stato)}</small>`;
      b.addEventListener('click', () => scheda(perId.get(p.id) || p));
      li.appendChild(b); ul.appendChild(li);
    });
  };
  $('q').addEventListener('input', () => {
    clearTimeout(attesa);
    const q = $('q').value.trim().toLowerCase();
    if (q.length < 2) { $('risultati').innerHTML = ''; return; }
    if (elencoPronto) {
      const trovati = [...perId.values()].filter((p) => (p.nome + ' ' + p.cognome).toLowerCase().includes(q) || (p.cognome + ' ' + p.nome).toLowerCase().includes(q)).slice(0, 12);
      return elencaRisultati(trovati);
    }
    attesa = setTimeout(async () => {                    // script vecchio: cerco sul foglio
      const r = await api({ op: 'cerca', q });
      conteggi(r.conteggi);
      if (!r.ok) { $('risultati').innerHTML = '<li><small>nessuna connessione.</small></li>'; return; }
      elencaRisultati(r.persone);
    }, 300);
  });

  // ------------------------------------------------ staff (subito, salvato in sottofondo)
  const staff = (delta) => () => { staffQui += delta; ricorda(); mostraConteggi(); salva(); };
  $('staff-piu').addEventListener('click', staff(1));
  $('staff-meno').addEventListener('click', staff(-1));
})();
