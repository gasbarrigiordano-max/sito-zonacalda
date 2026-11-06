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
      $('luogo').textContent = r.luogo || '';
      $('luogo').hidden = !r.luogo;
      return mostra('s-confermato');
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

  // invito da scaricare, formato storia 1080×1920
  $('scarica').addEventListener('click', async () => {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#050505'; g.fillRect(0, 0, W, H);

    const logo = new Image();
    logo.src = '../assets/zonacalda-logo-sito.svg';
    try { await logo.decode(); g.drawImage(logo, 0, 260, W, W * 544 / 1244); } catch (e) { /* senza logo */ }

    const font = (peso, px) => peso + ' ' + px + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#f0eded';
    g.font = font(600, 64);
    g.fillText(minuscolo(dati.nome) + ', sei dentro.', W / 2, 860);
    g.fillStyle = '#9b9696';
    g.font = font(400, 40);
    g.fillText('sabato 14 novembre · 23:30', W / 2, 930);

    // QR
    const q = qrSvg(token);
    const n = q.getModuleCount();
    const lato = 520, x0 = (W - lato) / 2, y0 = 1010, cella = lato / n;
    g.shadowColor = 'rgba(255,20,36,.7)'; g.shadowBlur = 40;
    g.fillStyle = '#fff'; g.fillRect(x0 - 30, y0 - 30, lato + 60, lato + 60);
    g.shadowBlur = 0;
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(x0 + k * cella, y0 + r * cella, Math.ceil(cella), Math.ceil(cella));

    g.fillStyle = '#9b9696';
    g.font = font(400, 34);
    g.fillText('ingresso garantito fino alle 00:30.', W / 2, 1660);
    g.fillText('porta un documento. 23+.', W / 2, 1710);

    const nome = 'zonacalda-invito.png';
    c.toBlob(async (blob) => {
      const file = new File([blob], nome, { type: 'image/png' });
      // su telefono: condividi/salva in galleria; altrimenti scarica
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
})();
