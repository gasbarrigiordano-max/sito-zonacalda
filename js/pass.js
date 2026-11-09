// Zonacalda — pass come foto (PNG), disegnato sul telefono.
//   ospiti: formato storia 1080×1920      staff: biglietto 1080×1350 con la scritta STAFF
// zcPass({ token, nome, staff, base }) → Promise<Blob>
(() => {
  const ROSSO = '255,20,36';
  const TESTO_OSPITI = [
    'ti aspettiamo *sabato 14 novembre* alle *23:30*',
    'palazzo podestà · via dei prati 4, civitavecchia',
    '',
    'il tuo accesso è garantito fino alle *00:30*.',
    'dopo, le porte si apriranno anche a chi non ha l\'invito:',
    'la selezione all\'ingresso sarà rigida.',
    '',
    'invito personale, valido per una persona.',
    'porta un documento d\'identità. 23+.',
  ];
  const TESTO_STAFF = [
    'ti aspettiamo *sabato 14 novembre* alle *23:30*',
    'palazzo podestà · via dei prati 4, civitavecchia',
    '',
    'pass personale, valido per una persona.',
  ];

  let pronto = null;
  const carica = (base) => pronto || (pronto = (async () => {
    const f = new FontFace('Macchina', `url(${base}assets/font/special-elite-400.woff2) format('woff2')`);
    try { document.fonts.add(await f.load()); } catch (e) { /* senza font: monospace */ }
    const logo = new Image();
    logo.src = base + 'assets/zonacalda-logo-2righe-sito.svg';
    try { await logo.decode(); } catch (e) { return { logo: null }; }
    return { logo };
  })());

  const font = (px) => `${px}px Macchina, "Courier New", monospace, "Apple Color Emoji", "Noto Color Emoji"`;

  // sfondo: muro di mattoni appena visibile, vignetta nera, alone rosso in alto
  const sfondo = (g, W, H) => {
    g.fillStyle = '#0a0607'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
    g.beginPath();
    for (let y = 0; y < H; y += 60) {
      g.moveTo(0, y + 1); g.lineTo(W, y + 1); g.moveTo(0, y + 31); g.lineTo(W, y + 31);
      for (let x = 0; x < W + 120; x += 120) {
        g.moveTo(x + 1, y + 1); g.lineTo(x + 1, y + 31);
        g.moveTo(x + 61, y + 31); g.lineTo(x + 61, y + 60);
      }
    }
    g.stroke();
    const ellisse = (cx, cy, rx, ry, stop) => {
      g.save(); g.translate(cx, cy); g.scale(rx, ry);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      stop(gr); g.fillStyle = gr; g.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
      g.restore();
    };
    ellisse(W / 2, H / 2, W / 2 * Math.SQRT2, H / 2 * Math.SQRT2, (gr) => { gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(0.88, '#000'); gr.addColorStop(1, '#000'); });
    ellisse(W / 2, H * 0.14, W * 0.65, H * 0.3, (gr) => { gr.addColorStop(0, 'rgba(255,30,45,.2)'); gr.addColorStop(0.75, 'rgba(255,30,45,0)'); gr.addColorStop(1, 'rgba(255,30,45,0)'); });
  };

  // testo con alone (come text-shadow: un passaggio per ogni ombra)
  const neon = (g, testo, x, y, colore, ombre, spazio = 0) => {
    const disegna = () => {
      if (!spazio) return g.fillText(testo, x, y);
      const lettere = [...testo];
      const w = lettere.reduce((s, c) => s + g.measureText(c).width, 0) + spazio * (lettere.length - 1);
      let cx = x - w / 2;
      g.textAlign = 'left';
      for (const c of lettere) { g.fillText(c, cx, y); cx += g.measureText(c).width + spazio; }
      g.textAlign = 'center';
    };
    g.save(); g.fillStyle = colore;
    for (const [blur, ombra] of ombre) { g.shadowBlur = blur; g.shadowColor = ombra; disegna(); }
    g.shadowBlur = 0; g.shadowColor = 'transparent'; disegna();
    g.restore();
  };

  // righe centrate; *parole* in bianco
  const paragrafo = (g, righe, cx, y0, px, lh, colore) => {
    g.font = font(px); g.textAlign = 'left';
    righe.forEach((riga, i) => {
      const pezzi = riga.split('*').map((t, k) => ({ t, b: k % 2 === 1 }));
      const w = pezzi.reduce((s, p) => s + g.measureText(p.t).width, 0);
      let x = cx - w / 2;
      const y = y0 + lh * (i + 0.5);
      for (const p of pezzi) { g.fillStyle = p.b ? '#fff' : colore; g.fillText(p.t, x, y); x += g.measureText(p.t).width; }
    });
    g.textAlign = 'center';
  };

  const tondo = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

  // riquadro bianco del QR con bordo rosso acceso
  const qr = (g, token, x, y, lato, pad) => {
    const L = lato + pad * 2;
    g.save();
    tondo(g, x - 4, y - 4, L + 8, L + 8, 22);
    g.fillStyle = '#ff2634';
    for (const [b, c] of [[80, `rgba(${ROSSO},.35)`], [34, `rgba(${ROSSO},.8)`]]) { g.shadowBlur = b; g.shadowColor = c; g.fill(); }
    g.shadowBlur = 0; g.fill();
    tondo(g, x, y, L, L, 18); g.fillStyle = '#fff'; g.fill();
    g.restore();
    const q = qrcode(0, 'M'); q.addData(token); q.make();
    const n = q.getModuleCount(), cella = lato / n;
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
      if (q.isDark(r, k)) g.fillRect(x + pad + k * cella, y + pad + r * cella, Math.ceil(cella), Math.ceil(cella));
    }
  };

  const ospite = (g, { logo }, token, nome) => {
    const W = 1080;
    sfondo(g, W, 1920);
    if (logo) g.drawImage(logo, 280, 110, 520, 367);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(52); neon(g, nome + ', sei dentro.', W / 2, 586, '#fff', [[10, 'rgba(255,255,255,.3)']]);
    qr(g, token, 294, 660, 440, 26);
    g.font = font(44); neon(g, 'ti aspettiamo nel nostro club. 😈', W / 2, 1242, '#ff4b55', [[12, `rgba(${ROSSO},.8)`], [2, '#ff3a46']]);
    paragrafo(g, TESTO_OSPITI, W / 2, 1320, 29, 42.05, '#d9d3d3');
  };

  const staff = (g, { logo }, token, nome) => {
    const W = 1080;
    sfondo(g, W, 1350);
    // biglietto
    tondo(g, 70, 60, 940, 1230, 28); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    g.save(); g.setLineDash([7, 7]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,38,52,.55)'; tondo(g, 71, 61, 938, 1228, 27); g.stroke(); g.restore();
    if (logo) g.drawImage(logo, 350, 92, 380, 268);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(52); neon(g, nome, W / 2, 390, '#fff', [[10, 'rgba(255,255,255,.3)']]);
    g.font = font(104);
    neon(g, 'STAFF', W / 2 + 8, 486, '#fff4f4',
      [[140, `rgba(${ROSSO},.45)`], [90, `rgba(${ROSSO},.75)`], [46, '#ff1424'], [22, '#ff2634'], [10, '#ff4b55'], [4, '#fff']], 104 * 0.16);
    g.font = font(36);
    neon(g, 'sab 14.11', 343, 570, '#ff4b55', [[10, `rgba(${ROSSO},.7)`]]);
    neon(g, '23:30', 771, 570, '#ff4b55', [[10, `rgba(${ROSSO},.7)`]]);
    g.save(); g.setLineDash([9, 9]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.moveTo(72, 615.5); g.lineTo(1008, 615.5); g.stroke(); g.restore();
    qr(g, token, 349, 641, 330, 26);
    g.font = font(34); neon(g, 'la porta è aperta. per te.', W / 2, 1064, '#ff4b55', [[12, `rgba(${ROSSO},.8)`], [2, '#ff3a46']]);
    paragrafo(g, TESTO_STAFF, W / 2, 1103, 23, 33.35, '#d9d3d3');
  };

  window.zcPass = async ({ token, nome, staff: eStaff, base = '../' }) => {
    const risorse = await carica(base);
    const c = document.createElement('canvas');
    c.width = 1080; c.height = eStaff ? 1350 : 1920;
    const g = c.getContext('2d');
    const chi = String(nome || '').toLocaleLowerCase('it').trim();
    (eStaff ? staff : ospite)(g, risorse, token, chi);
    return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('pass'))), 'image/png'));
  };

  // salva in galleria (telefono) o scarica (computer)
  window.zcSalvaPass = async (blob, nomeFile) => {
    const file = new File([blob], nomeFile, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nomeFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
})();
