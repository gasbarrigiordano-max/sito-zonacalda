// Zonacalda — accensione dell'insegna e conto alla rovescia.

(() => {
  const APERTURA = new Date('2026-11-14T23:00:00+01:00'); // sab 14.11, 23:00 ora italiana
  const CHIUSURA = new Date('2026-11-15T06:00:00+01:00'); // fino a quando vale "fa caldo."

  /* ---------- accensione a sfarfallio ---------- */
  const root = document.documentElement;
  if (root.classList.contains('accendi')) {
    const rnd = (a, b) => a + Math.random() * (b - a);

    // diavolo per primo, CLUB USE per ultimo, il resto in ordine casuale tra i due
    const mezzo = ['z', 'n', 'a1', 'c', 'a2', 'l', 'd', 'a3', 'vl', 'vr'].sort(() => Math.random() - .5);
    const ordine = ['o', ...mezzo, 'u'];
    const inizio = (i) => 350 + (i / (ordine.length - 1)) * 1300 + (i && i < ordine.length - 1 ? rnd(-60, 60) : 0);

    const lampi = () => {
      // 3-5 lampi brevi (30-70 ms, intensità .35-.95) separati da buio, poi acceso
      const n = 3 + Math.floor(Math.random() * 3);
      const passi = [];
      for (let i = 0; i < n; i++) {
        passi.push([rnd(30, 70), rnd(.35, .95)]);
        passi.push([rnd(40, 130), 0]);
      }
      passi.push([1, 1]);
      const tot = passi.reduce((s, p) => s + p[0], 0);
      let t = 0;
      const kf = [{ opacity: 0, offset: 0 }];
      for (const [dur, op] of passi) {
        kf.push({ opacity: op, offset: Math.min(t / tot, 1) });   // accensione/spegnimento istantanei
        t += dur;
        kf.push({ opacity: op, offset: Math.min(t / tot, 1) });
      }
      return { kf, tot };
    };

    let ultimo = 0;
    ordine.forEach((id, i) => {
      const els = document.querySelectorAll('.logo .g-' + id);
      const { kf, tot } = lampi();
      const delay = inizio(i);
      ultimo = Math.max(ultimo, delay + tot);
      els.forEach((el) => el.animate(kf, { duration: tot, delay, fill: 'forwards', easing: 'linear' }));
      if (id === 'o') {
        // il diavolo si disegna mentre si accende
        els.forEach((el) => el.animate(
          [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
          { duration: 1500, delay, fill: 'forwards', easing: 'cubic-bezier(.55,.1,.35,1)' }
        ));
      }
    });
    // a fine animazione lascia l'insegna accesa senza animazioni appese
    setTimeout(() => {
      root.classList.remove('accendi');
      document.querySelectorAll('.logo .g').forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    }, Math.max(ultimo, 350 + 1500) + 100);
  }

  /* ---------- conto alla rovescia ---------- */
  const frase = document.getElementById('frase');
  const conto = document.getElementById('conto');
  const due = (n) => String(n).padStart(2, '0');

  const aggiorna = () => {
    const ora = new Date();
    const ms = APERTURA - ora;
    if (ora >= CHIUSURA) {
      frase.textContent = 'ci vediamo.';
      conto.textContent = '';
      return false;
    }
    if (ms <= 0) {
      frase.textContent = 'fa caldo. 😈';
      conto.textContent = '';
      return true;
    }
    const s = Math.floor(ms / 1000);
    const g = Math.floor(s / 86400);
    conto.textContent = g >= 1
      ? `-${g} ${g === 1 ? 'giorno' : 'giorni'}.`
      : `-${due(Math.floor(s / 3600))}:${due(Math.floor(s / 60) % 60)}:${due(s % 60)}.`;
    return true;
  };

  if (aggiorna()) {
    const id = setInterval(() => { if (!aggiorna()) clearInterval(id); }, 1000);
  }
})();
