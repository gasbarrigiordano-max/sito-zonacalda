(() => {
  const $ = (id) => document.getElementById(id);
  const f = $('modulo');
  const err = $('errore');
  const btn = $('invia');
  const eta = (iso) => {                      // anni compiuti il giorno della serata
    const [a, m, g] = iso.split('-').map(Number);
    return 2026 - a - ((11 < m || (11 === m && 14 < g)) ? 1 : 0);
  };
  const maiuscole = (s) => String(s || '').toLocaleLowerCase('it').replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('it'));

  const esito = (titolo, testo) => {
    $('s-modulo').hidden = true; $('s-pass').hidden = true;
    $('esito-titolo').textContent = titolo;
    $('esito-testo').textContent = testo || '';
    $('esito').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const mostraPass = (token, nome, cognome) => {
    $('s-modulo').hidden = true; $('esito').hidden = true;
    $('chi').textContent = maiuscole(nome + ' ' + (cognome || ''));
    const q = qrcode(0, 'M'); q.addData(token); q.make();
    $('qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    $('s-pass').hidden = false;
    zcPass({ token, nome: nome + ' ' + (cognome || ''), backstage: true }).then((foto) => {
      $('foto').src = URL.createObjectURL(foto);
      $('foto').hidden = false; $('tieni').hidden = false; $('salva').hidden = false; $('semplice').hidden = true;
      $('salva').onclick = () => zcSalvaPass(foto, 'zonacalda-pass-backstage.png');
      if (navigator.clipboard && window.ClipboardItem && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        $('copia').hidden = false;
        $('copia').onclick = async () => { $('copia').textContent = (await zcCopiaPass(foto)) ? 'copiata. incollala nella chat.' : 'non riesco: usa "salva il pass."'; };
      }
    }).catch((e) => console.error(e));                  // se non riesce resta il QR semplice
    try { history.replaceState(null, '', '?t=' + token); } catch (e) { /* niente */ }   // così la pagina si può salvare
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const ricordo = {                                      // il pass resta sul telefono: alla riapertura compare subito
    leggi: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    scrivi: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } },
    togli: (k) => { try { localStorage.removeItem(k); } catch (e) { /* niente */ } },
  };
  // aperto dal link: mostra il pass (subito, se è già stato aperto su questo telefono) e intanto lo controlla
  const t = new URLSearchParams(location.search).get('t');
  if (t) {
    $('s-modulo').hidden = true;
    if (window.zcPrecarica) zcPrecarica();
    const k = 'zc-pass-' + t, gia = ricordo.leggi(k);
    if (gia && gia.nome) mostraPass(t, gia.nome, gia.cognome);
    zcApi({ azione: 'pass', token: t }).then((r) => {
      if (r.ok) {
        ricordo.scrivi(k, { nome: r.nome, cognome: r.cognome });
        if (!gia || gia.nome !== r.nome || gia.cognome !== r.cognome) mostraPass(t, r.nome, r.cognome);
        return;
      }
      if (r.errore === 'rete' && gia) return;                // senza rete resta il pass salvato
      ricordo.togli(k);
      if (r.errore === 'rete') esito('nessuna connessione.', 'riprova tra poco.');
      else if (r.errore === 'non_confermato') esito('pass non ancora attivo.', 'arriva appena confermiamo la prenotazione. 😈');
      else esito('pass non valido.', 'chiedi a chi ti ha mandato il link.');
    });
  }

  const sbagliato = (campo, msg) => {
    f.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (campo) { f.elements[campo].setAttribute('aria-invalid', 'true'); f.elements[campo].focus(); }
    err.textContent = msg;
    return false;
  };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = {
      azione: 'backstage',
      nome: f.nome.value.trim(),
      cognome: f.cognome.value.trim(),
      nascita: f.nascita.value,
      telefono: f.telefono.value.trim(),
      sito: f.sito.value,
      informativa: f.informativa.checked,
    };
    if (!d.nome) return sbagliato('nome', 'scrivi il nome.');
    if (!d.cognome) return sbagliato('cognome', 'scrivi il cognome.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.nascita)) return sbagliato('nascita', 'manca la data di nascita.');
    if (eta(d.nascita) < 23) return esito('non ancora.', 'il backstage è dai 23 anni in su.');
    if (d.telefono.replace(/\D/g, '').length < 8) return sbagliato('telefono', 'controlla il numero.');
    if (!d.informativa) return sbagliato('informativa', 'devi accettare l\'informativa.');
    sbagliato(null, '');
    btn.disabled = true; btn.textContent = 'un attimo…';
    const r = await zcApi(d);
    btn.disabled = false; btn.textContent = 'prenota.';
    if (r.ok && r.gia) return esito('hai già prenotato.', 'ti scriviamo noi su whatsapp. 😈');
    if (r.ok) return esito('richiesta ricevuta.', 'ti scriviamo su whatsapp per confermare. poi arriva il pass d\'oro. 😈');
    const msg = {
      pieno: () => esito('posti finiti.', 'il backstage è al completo.'),
      eta: () => esito('non ancora.', 'il backstage è dai 23 anni in su.'),
      nascita: () => sbagliato('nascita', 'controlla la data di nascita.'),
      campi: () => sbagliato('nome', 'scrivi nome e cognome.'),
      telefono: () => sbagliato('telefono', 'controlla il numero.'),
      informativa: () => sbagliato('informativa', 'devi accettare l\'informativa.'),
      non_attivo: () => esito('presto.', 'la pagina apre a breve.'),
    }[r.errore];
    if (msg) msg(); else sbagliato(null, 'qualcosa non va. riprova tra poco.');
  });
})();
