(() => {
  const token = new URLSearchParams(location.search).get('t') || '';
  const $ = (id) => document.getElementById(id);
  const mostra = (id) => {
    ['carico', 's-invitato', 's-confermato', 's-altro'].forEach((x) => { $(x).hidden = x !== id; });
  };
  const altro = (titolo, testo) => { $('altro-titolo').textContent = titolo; $('altro-testo').textContent = testo || ''; mostra('s-altro'); };
  const minuscolo = (s) => String(s || '').toLocaleLowerCase('it');
  let dati = null;

  const qrSvg = (testo) => {
    const q = qrcode(0, 'M');
    q.addData(testo);
    q.make();
    return q;
  };

  const disegna = (r) => {
    dati = r;
    if (r.stato === 'invitato') {
      $('ciao').textContent = minuscolo(r.nome) + ', sei dentro.';
      const d = new Date(r.scade);
      const giorno = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
      const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
      $('scade').textContent = giorno + ' alle ' + ora;   // es. "mercoledì 11 novembre alle 19:00"
      return mostra('s-invitato');
    }
    if (r.stato === 'confermato') {
      $('ciao2').textContent = minuscolo(r.nome) + ', ci vediamo.';
      $('qr').innerHTML = qrSvg(token).createSvgTag({ cellSize: 6, margin: 0, scalable: true });
      const extra = r.luogo && !/via dei prati/i.test(r.luogo) ? r.luogo : '';   // indicazioni in più dal foglio
      $('luogo').textContent = extra;
      $('luogo').hidden = !extra;
      mostra('s-confermato');
      return preparaFoto();
    }
    if (r.stato === 'entrato') return altro('sei già dentro. 😈');
    if (r.stato === 'rifiutato') return altro('peccato.', 'alla prossima. 😈');
    if (r.stato === 'scaduto') return altro('tempo scaduto.', 'il posto è passato a qualcun altro.');
    return altro('invito non valido.', '');
  };

  const errore = (r) => {
    if (r.errore === 'pieno') return altro('posti finiti.', 'ci dispiace. alla prossima. 😈');
    if (r.errore === 'invito') return altro('invito non valido.', 'controlla il link che ti abbiamo mandato.');
    if (r.errore === 'non_attivo') return altro('presto.', '');
    $('errore').textContent = 'qualcosa non va. riprova tra poco.';
    if ($('s-invitato').hidden) altro('qualcosa non va.', 'riprova tra poco.');
  };

  const carica = async (azione) => {
    const r = await zcApi({ azione, token });
    if (r.ok) disegna(r); else errore(r);
  };

  if (!/^[A-Za-z0-9]{20,40}$/.test(token)) altro('invito non valido.', 'controlla il link che ti abbiamo mandato.');
  else carica('invito');

  const scegli = (azione, btn) => async () => {
    $('si').disabled = $('no').disabled = true;
    btn.textContent = 'un attimo…';
    await carica(azione);
    $('si').disabled = $('no').disabled = false;
    $('si').textContent = 'ci sono.'; $('no').textContent = 'non ce la faccio.';
  };
  $('si').addEventListener('click', scegli('conferma', $('si')));
  $('no').addEventListener('click', () => {
    if (confirm('sicuro? il posto passa a qualcun altro.')) scegli('rifiuta', $('no'))();
  });

  // pass come foto (formato storia), da tenere premuto o salvare
  let foto = null;
  const preparaFoto = async () => {
    try {
      foto = await zcPass({ token, nome: dati.nome + ' ' + (dati.cognome || ''), staff: false });
      $('foto').src = URL.createObjectURL(foto);
      $('foto').hidden = false; $('tieni').hidden = false; $('qr').hidden = true;
      if (navigator.clipboard && window.ClipboardItem && !/iPhone|iPad|Android/i.test(navigator.userAgent)) {
        $('copia').hidden = false;
        $('copia').onclick = async () => { $('copia').textContent = (await zcCopiaPass(foto)) ? 'copiata. incollala nella chat.' : 'non riesco: usa "salva il pass."'; };
      }
    } catch (e) { console.error(e); }                    // se non riesce resta il QR semplice
  };
  $('scarica').addEventListener('click', async () => {
    if (!foto) await preparaFoto();
    if (foto) zcSalvaPass(foto, 'zonacalda-invito.png');
  });
})();
