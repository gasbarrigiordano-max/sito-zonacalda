// Zonacalda — pass come foto (PNG), disegnato sul telefono.
//   ospiti: formato storia 1080×1920      staff: biglietto 1080×1350 con la scritta STAFF
//   backstage: biglietto in lamina d'oro 1080×1920
// zcPass({ token, nome, staff, backstage, base }) → Promise<Blob>
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

  const TESTO_BACKSTAGE = [
    'sabato *14 novembre* · dalle *23:30*',
    'palazzo podestà · via dei prati 4, civitavecchia',
    '',
    'accesso al *backstage*, dietro la console.',
    '',
    'pass personale, valido per una persona.',
    'porta un documento d\'identità. 23+.',
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

  // biglietto in lamina d'oro: logo e scritte incisi in nero
  const NERO = '#1a1206';
  const lamina = (g, x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    [[0, '#7a5410'], [.18, '#c99a2e'], [.32, '#fff0b8'], [.46, '#d9a93a'], [.6, '#8a5e12'], [.76, '#e6bd55'], [.88, '#fff3c8'], [1, '#a9781c']]
      .forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  };
  const backstage = (g, { logo }, token, nome) => {
    const W = 1080, H = 1920, X = 70, Y = 90, CW = 940, CH = 1740;
    g.fillStyle = '#0a0805'; g.fillRect(0, 0, W, H);
    g.save();
    tondo(g, X, Y, CW, CH, 34); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
    g.fillStyle = lamina(g, X, Y, X + CW, Y + CH); g.fill();
    g.restore();
    g.save(); tondo(g, X, Y, CW, CH, 34); g.clip();
    g.fillStyle = 'rgba(255,255,255,.05)';                     // spazzolatura del metallo
    for (let x = X; x < X + CW; x += 5) g.fillRect(x, Y, 2, CH);
    g.restore();
    g.save(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.35)'; tondo(g, X + 1.5, Y + 1.5, CW - 3, CH - 3, 33); g.stroke(); g.restore();
    if (logo) {                                                // il logo, inciso in nero
      const lc = document.createElement('canvas'); lc.width = 400; lc.height = 282;
      const lg = lc.getContext('2d'); lg.drawImage(logo, 0, 0, 400, 282);
      lg.globalCompositeOperation = 'source-in'; lg.fillStyle = NERO; lg.fillRect(0, 0, 400, 282);
      g.drawImage(lc, 340, 140);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(130);
    neon(g, 'BACKSTAGE', W / 2, 507, 'rgba(255,255,255,.45)', [], 130 * .08);   // riflesso sotto, come inciso
    neon(g, 'BACKSTAGE', W / 2, 505, NERO, [], 130 * .08);
    let fn = 58; g.font = font(fn);
    while (g.measureText(nome + ', sei dentro.').width > CW - 100 && fn > 36) g.font = font(--fn);   // nomi lunghi: un po' più piccolo
    neon(g, nome + ', sei dentro.', W / 2, 660, NERO, []);
    // QR su avorio, bordo nero
    const lato = 420, pad = 28, L = lato + pad * 2, qx = (W - L) / 2, qy = 790;
    tondo(g, qx - 5, qy - 5, L + 10, L + 10, 26); g.fillStyle = NERO; g.fill();
    tondo(g, qx, qy, L, L, 22); g.fillStyle = '#fff8e0'; g.fill();
    const q = qrcode(0, 'M'); q.addData(token); q.make();
    const n = q.getModuleCount(), cella = lato / n;
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
      if (q.isDark(r, k)) g.fillRect(qx + pad + k * cella, qy + pad + r * cella, Math.ceil(cella), Math.ceil(cella));
    }
    // talloncino: due mezzelune e la riga da strappare
    g.fillStyle = '#0a0805';
    for (const cx of [X, X + CW]) { g.beginPath(); g.arc(cx, 1415, 35, 0, Math.PI * 2); g.fill(); }
    g.save(); g.setLineDash([14, 10]); g.lineWidth = 5; g.strokeStyle = 'rgba(26,18,6,.45)';
    g.beginPath(); g.moveTo(X + 60, 1415.5); g.lineTo(X + CW - 60, 1415.5); g.stroke(); g.restore();
    // testo: le *parole* sottolineate
    g.font = font(30); g.textAlign = 'left';
    TESTO_BACKSTAGE.forEach((riga, i) => {
      const pezzi = riga.split('*').map((t, k) => ({ t, b: k % 2 === 1 }));
      const w = pezzi.reduce((s, p) => s + g.measureText(p.t).width, 0);
      let x = W / 2 - w / 2;
      const y = 1478 + 42.6 * (i + .5);
      for (const p of pezzi) {
        g.fillStyle = NERO; g.fillText(p.t, x, y);
        const pw = g.measureText(p.t).width;
        if (p.b) g.fillRect(x, y + 17, pw, 2);
        x += pw;
      }
    });
    g.textAlign = 'center';
  };

  window.zcPass = async ({ token, nome, staff: eStaff, backstage: eBk, base = '../' }) => {
    const risorse = await carica(base);
    const c = document.createElement('canvas');
    c.width = 1080; c.height = eStaff ? 1350 : 1920;
    const g = c.getContext('2d');
    const chi = String(nome || '').toLocaleLowerCase('it').trim();
    (eBk ? backstage : eStaff ? staff : ospite)(g, risorse, token, chi);
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

  // copia la foto negli appunti (computer: poi si incolla nella chat di WhatsApp Web)
  window.zcCopiaPass = async (blob) => {
    if (!navigator.clipboard || !window.ClipboardItem) return false;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true; } catch (e) { return false; }
  };
})();
