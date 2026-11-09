(() => {
  const $ = (id) => document.getElementById(id);
  const f = $('modulo');
  const err = $('errore');
  const btn = $('invia');
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
    try { history.replaceState(null, '', '?t=' + token); } catch (e) { /* niente */ }   // così la pagina si può salvare
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // aperta dal link della mail: mostra il pass
  const t = new URLSearchParams(location.search).get('t');
  if (t) {
    $('s-modulo').hidden = true;
    zcApi({ azione: 'pass', token: t }).then((r) => {
      if (r.ok) mostraPass(t, r.nome, r.cognome);
      else if (r.errore === 'rete') esito('nessuna connessione.', 'riprova tra poco.');
      else { $('s-modulo').hidden = false; sbagliato(null, 'pass non valido: registrati qui sotto.'); }
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
      azione: 'staff',
      nome: f.nome.value.trim(),
      cognome: f.cognome.value.trim(),
      telefono: f.telefono.value.trim(),
      sito: f.sito.value,
      informativa: f.informativa.checked,
    };
    if (!d.nome) return sbagliato('nome', 'scrivi il nome.');
    if (!d.cognome) return sbagliato('cognome', 'scrivi il cognome.');
    if (d.telefono.replace(/\D/g, '').length < 8) return sbagliato('telefono', 'controlla il numero.');
    if (!d.informativa) return sbagliato('informativa', 'devi accettare l\'informativa.');
    sbagliato(null, '');
    btn.disabled = true; btn.textContent = 'un attimo…';
    const r = await zcApi(d);
    btn.disabled = false; btn.textContent = 'registrami.';
    if (r.ok && r.token) return mostraPass(r.token, r.nome || d.nome, r.cognome || d.cognome);
    const msg = {
      non_abilitato: () => sbagliato('cognome', 'non sei nella lista staff. controlla nome e cognome, o scrivi a chi ti ha chiamato.'),
      bloccato: () => sbagliato(null, 'troppi tentativi. riprova tra 10 minuti.'),
      altro_numero: () => sbagliato('telefono', 'sei già registrato con un altro numero. scrivi il numero che avevi dato, o scrivi a chi ti ha chiamato.'),
      telefono: () => sbagliato('telefono', 'controlla il numero.'),
      informativa: () => sbagliato('informativa', 'devi accettare l\'informativa.'),
      non_attivo: () => esito('presto.', 'la pagina apre a breve.'),
    }[r.errore];
    if (msg) msg(); else sbagliato(null, 'qualcosa non va. riprova tra poco.');
  });
})();
