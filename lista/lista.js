(() => {
  const SERATA = '2026-11-14';
  const ETA_MINIMA = 23;
  const f = document.getElementById('modulo');
  const err = document.getElementById('errore');
  const btn = document.getElementById('invia');

  const fonte = (new URLSearchParams(location.search).get('da') || 'diretto').slice(0, 30);

  const esito = (titolo, testo) => {
    f.hidden = true;
    document.getElementById('esito-titolo').textContent = titolo;
    document.getElementById('esito-testo').textContent = testo || '';
    document.getElementById('esito').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eta = (iso) => {
    const [a, m, g] = iso.split('-').map(Number);
    const [A, M, G] = SERATA.split('-').map(Number);
    return A - a - ((M < m || (M === m && G < g)) ? 1 : 0);
  };

  const sbagliato = (campo, msg) => {
    f.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (campo) { f.elements[campo].setAttribute('aria-invalid', 'true'); f.elements[campo].focus(); }
    err.textContent = msg;
    return false;
  };

  const valida = (d) => {
    if (!d.nome) return sbagliato('nome', 'manca il nome.');
    if (!d.cognome) return sbagliato('cognome', 'manca il cognome.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.nascita)) return sbagliato('nascita', 'manca la data di nascita.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return sbagliato('email', 'controlla l\'email.');
    if (d.telefono.replace(/\D/g, '').length < 8) return sbagliato('telefono', 'controlla il numero.');
    if (!d.informativa) return sbagliato('informativa', 'devi accettare l\'informativa.');
    return sbagliato(null, '') || true;
  };

  // prima di martedì 10.11 la lista non è "chiusa": non è ancora aperta
  const APERTURA = new Date('2026-11-10T00:00:00+01:00');
  const chiusa = () => (new Date() < APERTURA
    ? esito('presto.', 'la lista apre martedì. 😈')
    : esito('lista chiusa.', 'ci vediamo alla prossima. 😈'));

  // lista aperta?
  zcApi({ azione: 'lista' }).then((r) => {
    if (r.ok && r.aperta === false) chiusa();
    if (r.errore === 'non_attivo') esito('presto.', 'la lista apre a breve.');
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = {
      azione: 'iscrivi',
      nome: f.nome.value.trim(),
      cognome: f.cognome.value.trim(),
      nascita: f.nascita.value,
      email: f.email.value.trim(),
      telefono: f.telefono.value.trim(),
      instagram: f.instagram.value.trim(),
      sito: f.sito.value,
      informativa: f.informativa.checked,
      prossime: f.prossime.checked,
      fonte,
    };
    if (!valida(d)) return;
    if (eta(d.nascita) < ETA_MINIMA) {
      // non mandiamo i dati di chi non ha l'età
      esito('non ancora.', 'serve avere almeno ' + ETA_MINIMA + ' anni. ci vediamo più avanti.');
      return;
    }
    btn.disabled = true; btn.textContent = 'un attimo…';
    const r = await zcApi(d);
    btn.disabled = false; btn.textContent = 'mettimi in lista.';
    if (r.ok && r.gia) return esito('sei già in lista.', 'se tocca a te, ti scriviamo. 😈');
    if (r.ok) return esito('sei in lista.', 'se tocca a te, ti scriviamo. 😈');
    const msg = {
      chiusa: () => chiusa(),
      eta: () => esito('non ancora.', 'serve avere almeno ' + ETA_MINIMA + ' anni. ci vediamo più avanti.'),
      email: () => sbagliato('email', 'controlla l\'email.'),
      telefono: () => sbagliato('telefono', 'controlla il numero.'),
      nascita: () => sbagliato('nascita', 'controlla la data di nascita.'),
      informativa: () => sbagliato('informativa', 'devi accettare l\'informativa.'),
      non_attivo: () => esito('presto.', 'la lista apre a breve.'),
    }[r.errore];
    if (msg) msg(); else sbagliato(null, 'qualcosa non va. riprova tra poco.');
  });
})();
