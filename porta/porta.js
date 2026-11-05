(() => {
  const ETA_MINIMA = 23;
  const $ = (id) => document.getElementById(id);
  let pin = '';
  try { pin = sessionStorage.getItem('zc-pin') || ''; } catch (e) { /* niente */ }
  let stream = null, scansione = false, ultimo = '', blocco = 0, wake = null;

  const api = (dati) => zcApi({ azione: 'porta', pin, ...dati });
  const vibra = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* niente */ } };

  // ------------------------------------------------ conteggi
  const conteggi = (c) => {
    if (!c) return;
    $('dentro').textContent = c.dentro;
    $('capienza').textContent = c.capienza;
    $('dettaglio').textContent = `ospiti ${c.ospiti} · staff ${c.staff} · attesi ${c.attesi}`;
    $('avviso-0030').hidden = !(c.garantitoFino && new Date() >= new Date(c.garantitoFino));
    $('dentro').style.color = c.dentro >= c.capienza ? 'var(--rosso)' : '';
  };
  const dopo0030 = () => !$('avviso-0030').hidden;

  // ------------------------------------------------ accesso
  const entra = async () => {
    const r = await api({ op: 'stato' });
    if (!r.ok) {
      $('err-pin').textContent = r.errore === 'bloccato' ? 'troppi tentativi. riprova tra 10 minuti.'
        : r.errore === 'pin' ? 'PIN sbagliato.' : r.errore === 'non_attivo' ? 'sistema non ancora collegato.' : 'nessuna connessione. riprova.';
      return false;
    }
    try { sessionStorage.setItem('zc-pin', pin); } catch (e) { /* niente */ }
    $('accesso').hidden = true; $('lavoro').hidden = false;
    conteggi(r.conteggi);
    try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* non supportato */ }
    setInterval(async () => { const s = await api({ op: 'stato' }); if (s.ok) conteggi(s.conteggi); }, 20000);
    return true;
  };
  $('f-pin').addEventListener('submit', async (e) => {
    e.preventDefault();
    pin = e.target.pin.value.trim();
    await entra();
  });
  if (pin) entra();
  $('esci').addEventListener('click', () => {
    try { sessionStorage.removeItem('zc-pin'); } catch (e) { /* niente */ }
    location.reload();
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && wake) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* niente */ } }
  });

  // ------------------------------------------------ scheda persona
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const scheda = (p, nota) => {
    const box = $('scheda');
    box.hidden = false;
    if (!p) {
      box.className = 'scheda no';
      box.innerHTML = '<p class="grosso">QR NON VALIDO</p><p>non è un invito zonacalda.</p>';
      vibra([80, 60, 80]);
      return;
    }
    const nomeHtml = `<h2>${esc(p.nome)} ${esc(p.cognome)}</h2><p>${p.eta} anni · nato/a il ${esc(p.nascita.split('-').reverse().join('/'))}</p>`;
    const ctrl = '<p style="color:var(--tenue);font-size:.85rem">controlla il documento: nome e data di nascita.</p>';
    if (p.eta < ETA_MINIMA) {
      box.className = 'scheda no';
      box.innerHTML = `<p class="grosso">NO · MENO DI ${ETA_MINIMA} ANNI</p>${nomeHtml}`;
      vibra([80, 60, 80]); return;
    }
    if (p.stato === 'entrato') {
      box.className = 'scheda no';
      box.innerHTML = `<p class="grosso">GIÀ ENTRATO ALLE ${esc(p.entrato)}</p>${nomeHtml}<p>lo stesso invito non vale due volte.</p>`;
      vibra([80, 60, 80]); return;
    }
    if (p.stato === 'confermato') {
      box.className = 'scheda ok';
      box.innerHTML = `<p class="grosso">OK · INVITO CONFERMATO</p>${nomeHtml}${ctrl}${nota ? `<p>${esc(nota)}</p>` : ''}<button class="bottone" data-entra="${esc(p.id)}">fai entrare ✓</button>`;
      vibra(60); return;
    }
    box.className = 'scheda forse';
    box.innerHTML = `<p class="grosso">NON CONFERMATO · ${esc(String(p.stato).toUpperCase())}</p>${nomeHtml}` +
      (dopo0030()
        ? `${ctrl}<p>dopo le 00:30 può entrare se c'è posto.</p><button class="bottone" data-entra="${esc(p.id)}" data-forza="1">fai entrare comunque</button>`
        : '<p>prima delle 00:30 entra solo chi ha confermato.</p>');
    vibra([80, 60, 80]);
  };

  $('scheda').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-entra]');
    if (!b) return;
    b.disabled = true; b.textContent = 'un attimo…';
    const r = await api({ op: 'entra', id: b.dataset.entra, forza: !!b.dataset.forza });
    conteggi(r.conteggi);
    const box = $('scheda');
    if (r.ok) {
      box.className = 'scheda ok';
      box.innerHTML = `<p class="grosso">DENTRO ✓</p><h2>${esc(r.persona.nome)} ${esc(r.persona.cognome)}</h2>`;
      vibra(120);
      setTimeout(() => { if (box.innerHTML.includes('DENTRO')) box.hidden = true; ultimo = ''; }, 2500);
    } else if (r.errore === 'pieno') {
      box.className = 'scheda no';
      box.innerHTML = '<p class="grosso">SALA PIENA</p><p>aspetta che esca qualcuno.</p>';
    } else if (r.persona) {
      scheda(r.persona);
    } else {
      box.className = 'scheda no';
      box.innerHTML = '<p class="grosso">ERRORE</p><p>nessuna connessione. riprova.</p>';
    }
  });

  // ------------------------------------------------ fotocamera
  const tokenDa = (testo) => {
    const m = String(testo).match(/[?&]t=([A-Za-z0-9]{20,40})/);
    if (m) return m[1];
    return /^[A-Za-z0-9]{20,40}$/.test(testo) ? testo : '';
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
    const giro = async () => {
      if (!scansione) return;
      if (v.readyState >= 2 && Date.now() > blocco) {
        const lato = Math.min(v.videoWidth, v.videoHeight);
        const S = 480;
        c.width = S; c.height = S;
        g.drawImage(v, (v.videoWidth - lato) / 2, (v.videoHeight - lato) / 2, lato, lato, 0, 0, S, S);
        const img = g.getImageData(0, 0, S, S);
        const qr = jsQR(img.data, S, S, { inversionAttempts: 'dontInvert' });
        if (qr && qr.data && qr.data !== ultimo) {
          ultimo = qr.data;
          blocco = Date.now() + 1500;
          const tok = tokenDa(qr.data);
          if (!tok) scheda(null);
          else {
            $('scan-msg').textContent = 'controllo…';
            const r = await api({ op: 'qr', token: tok });
            $('scan-msg').textContent = 'inquadra il QR dell\'invito';
            conteggi(r.conteggi);
            if (r.ok) scheda(r.persona); else scheda(null);
          }
        }
      }
      setTimeout(() => requestAnimationFrame(giro), 120);
    };
    giro();
  };

  $('b-scan').addEventListener('click', () => (scansione ? ferma() : avvia()));

  // ------------------------------------------------ ricerca per nome
  let attesa = 0;
  $('b-cerca').addEventListener('click', () => {
    ferma();
    $('scheda').hidden = true;
    $('cerca').hidden = !$('cerca').hidden;
    if (!$('cerca').hidden) $('q').focus();
  });
  $('q').addEventListener('input', () => {
    clearTimeout(attesa);
    attesa = setTimeout(async () => {
      const q = $('q').value.trim();
      const ul = $('risultati');
      if (q.length < 2) { ul.innerHTML = ''; return; }
      const r = await api({ op: 'cerca', q });
      conteggi(r.conteggi);
      if (!r.ok) { ul.innerHTML = '<li><small>nessuna connessione.</small></li>'; return; }
      ul.innerHTML = r.persone.length ? '' : '<li><small>nessuno con questo nome.</small></li>';
      r.persone.forEach((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.innerHTML = `${esc(p.nome)} ${esc(p.cognome)} <small>· ${p.eta} anni · ${esc(p.stato)}</small>`;
        b.addEventListener('click', () => { scheda(p); $('scheda').scrollIntoView({ behavior: 'smooth' }); });
        li.appendChild(b); ul.appendChild(li);
      });
    }, 300);
  });

  // ------------------------------------------------ staff
  const staff = (delta) => async () => { const r = await api({ op: 'staff', delta }); if (r.ok) conteggi(r.conteggi); };
  $('staff-piu').addEventListener('click', staff(1));
  $('staff-meno').addEventListener('click', staff(-1));
})();
