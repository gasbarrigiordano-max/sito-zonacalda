// Collegamento al Foglio Google (app web di Apps Script).
// Dopo aver pubblicato lo script, incolla qui il suo indirizzo (finisce con /exec).
window.ZC_API = 'https://script.google.com/macros/s/AKfycby59JV6xirxIIgeMn4MHfsGIbKczXxQe_R61EpbzASnOB6AwcjqIfxoY9aL6YDahMe-/exec';   // foglio sull'account zonacalda

// Google ogni tanto risponde con una pagina d'errore invece dei dati (foglio occupato da troppe richieste insieme,
// o un suo problema passeggero): in quel caso la richiesta NON è stata eseguita, quindi si riprova da soli, fino a 3 volte.
// Se invece la rete cade a metà, si riprova solo per le richieste che leggono e basta (rifarle non cambia niente).
(function () {
  const SOLO_LETTURA = { invito: 1, pass: 1, lista: 1 };
  const REGIA_LETTURA = { nomi: 1, invii: 1, backstage: 1, passlista: 1 };
  const leggeSoltanto = (d) => SOLO_LETTURA[d.azione] || (d.azione === 'regia' && (!d.op || REGIA_LETTURA[d.op])) ||
    (d.azione === 'porta' && (d.op === 'elenco' || d.op === 'qr' || d.op === 'cerca' || d.op === 'stato'));
  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
  window.zcApi = async function (dati) {
    if (!window.ZC_API) return { ok: false, errore: 'non_attivo' };
    const veloce = dati.azione === 'porta' && dati.op === 'novita';       // si richiede da sola ogni 3 secondi: niente tentativi in più
    const tentativi = veloce ? 1 : 4;
    let errore = 'rete';
    for (let i = 0; i < tentativi; i++) {
      if (i) await pausa(800 * i + Math.random() * 400);
      let r;
      try {
        // corpo in testo semplice: niente richiesta preliminare CORS
        r = await fetch(window.ZC_API, { method: 'POST', body: JSON.stringify(dati), redirect: 'follow' });
      } catch (e) {
        errore = 'rete';
        if (leggeSoltanto(dati)) continue;                // rete caduta: rifare una lettura non cambia niente
        break;                                            // una scrittura potrebbe essere già arrivata: non la rifaccio
      }
      try {
        const j = await r.json();
        if (j && j.errore === 'occupato') { errore = 'occupato'; continue; }   // non eseguita: si riprova
        return j;
      } catch (e) { errore = 'occupato'; continue; }    // pagina d'errore di Google: non eseguita, si riprova
    }
    return { ok: false, errore: 'rete', motivo: errore };   // "rete" per le pagine: tengono i dati salvati e riprovano
  };
})();
