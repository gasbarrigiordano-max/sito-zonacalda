// Zonacalda — accensione dell'insegna.

(() => {
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
})();
