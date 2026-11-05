// Collegamento al Foglio Google (app web di Apps Script).
// Dopo aver pubblicato lo script, incolla qui il suo indirizzo (finisce con /exec).
window.ZC_API = '';

window.zcApi = async function (dati) {
  if (!window.ZC_API) return { ok: false, errore: 'non_attivo' };
  try {
    // corpo in testo semplice: niente richiesta preliminare CORS
    const r = await fetch(window.ZC_API, { method: 'POST', body: JSON.stringify(dati), redirect: 'follow' });
    return await r.json();
  } catch (e) {
    return { ok: false, errore: 'rete' };
  }
};
