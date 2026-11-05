/**
 * Zonacalda: lista d'attesa, inviti e porta.
 *
 * Questo script va incollato in un Foglio Google (Estensioni → Apps Script)
 * e pubblicato come "App web". Le istruzioni sono in apps-script/ISTRUZIONI.md.
 *
 * I dati personali restano SOLO nel Foglio Google. Il sito pubblico non li contiene.
 */

// ---------------------------------------------------------------- impostazioni
const SERATA = {
  dataISO: '2026-11-14',             // giorno della serata (per calcolare l'età)
  etaMinima: 23,
  capienza: 300,                     // totale, staff compreso
  staffPrevisto: 20,
  confermeMax: 315,                  // oltre questo numero: "posti finiti."
  oreConferma: 12,                   // tempo per confermare un invito
  garantitoFino: '2026-11-15T00:30:00+01:00',
  sito: 'https://www.zonacaldaclubuse.it/',
};

const FOGLIO = 'iscritti';
const COL = [
  'creato', 'id', 'nome', 'cognome', 'nascita', 'email', 'telefono', 'instagram',
  'fonte', 'prossime_serate', 'stato', 'token', 'invitato_il', 'scade_il',
  'risposto_il', 'entrato_il', 'whatsapp', 'note',
];
const STATI = ['in lista', 'da invitare', 'invitato', 'confermato', 'rifiutato', 'scaduto', 'entrato', 'escluso'];
const C = Object.fromEntries(COL.map((n, i) => [n, i]));   // indice di colonna (da 0)

// ---------------------------------------------------------------- web app
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, errore: 'richiesta' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (req.azione) {
      case 'iscrivi':  return out_(iscrivi_(req));
      case 'invito':   return out_(leggiInvito_(req.token));
      case 'conferma': return out_(rispondi_(req.token, true));
      case 'rifiuta':  return out_(rispondi_(req.token, false));
      case 'porta':    return out_(porta_(req));
      case 'lista':    return out_({ ok: true, aperta: listaAperta_() });
      default:         return out_({ ok: false, errore: 'azione' });
    }
  } catch (err) {
    console.error(err);
    return out_({ ok: false, errore: 'interno' });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return out_({ ok: true, servizio: 'zonacalda' });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- lista d'attesa
function iscrivi_(r) {
  if (!listaAperta_()) return { ok: false, errore: 'chiusa' };
  if (r.sito) return { ok: true };                       // campo trappola per i bot: fingiamo che sia andata

  const nome = pulisci_(r.nome, 60), cognome = pulisci_(r.cognome, 60);
  const email = pulisci_(r.email, 120).toLowerCase();
  const telefono = normalizzaTelefono_(r.telefono);
  const nascita = pulisci_(r.nascita, 10);
  const instagram = pulisci_(r.instagram, 40).replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '');
  const fonte = pulisci_(r.fonte, 30).replace(/[^a-z0-9-]/gi, '');

  if (!nome || !cognome) return { ok: false, errore: 'campi' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, errore: 'email' };
  if (telefono.replace(/\D/g, '').length < 8) return { ok: false, errore: 'telefono' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascita)) return { ok: false, errore: 'nascita' };
  if (r.informativa !== true) return { ok: false, errore: 'informativa' };

  // chi non ha l'età non viene salvato
  const eta = eta_(nascita, SERATA.dataISO);
  if (!(eta >= SERATA.etaMinima) || eta > 99) return { ok: false, errore: 'eta' };

  const sh = foglio_();
  const righe = dati_(sh);
  if (righe.some((x) => String(x[C.email]).toLowerCase() === email || normalizzaTelefono_(x[C.telefono]) === telefono)) {
    return { ok: true, gia: true };
  }

  const riga = new Array(COL.length).fill('');
  riga[C.creato] = new Date();
  riga[C.id] = Utilities.getUuid().slice(0, 8);
  riga[C.nome] = nome;
  riga[C.cognome] = cognome;
  riga[C.nascita] = nascita;
  riga[C.email] = email;
  riga[C.telefono] = telefono;
  riga[C.instagram] = instagram ? '@' + instagram : '';
  riga[C.fonte] = fonte;
  riga[C.prossime_serate] = r.prossime === true ? 'sì' : 'no';
  riga[C.stato] = 'in lista';
  sh.appendRow(riga);
  return { ok: true };
}

function listaAperta_() {
  return PropertiesService.getScriptProperties().getProperty('LISTA') === 'aperta';
}

// ---------------------------------------------------------------- invito
function leggiInvito_(token) {
  const t = trova_(token);
  if (!t) return { ok: false, errore: 'invito' };
  scadiSeServe_(t);
  const x = t.riga;
  const ris = {
    ok: true,
    stato: x[C.stato],
    nome: x[C.nome],
    scade: x[C.scade_il] ? new Date(x[C.scade_il]).toISOString() : null,
    garantitoFino: SERATA.garantitoFino,
  };
  if (x[C.stato] === 'confermato') {
    ris.cognome = x[C.cognome];
    ris.luogo = PropertiesService.getScriptProperties().getProperty('LUOGO') || '';
  }
  return ris;
}

function rispondi_(token, si) {
  const t = trova_(token);
  if (!t) return { ok: false, errore: 'invito' };
  scadiSeServe_(t);
  const x = t.riga;
  if (x[C.stato] !== 'invitato') return leggiInvito_(token);   // già risposto o scaduto: restituisce lo stato attuale
  if (si) {
    const confermati = dati_(t.sh).filter((y) => y[C.stato] === 'confermato' || y[C.stato] === 'entrato').length;
    if (confermati >= SERATA.confermeMax) return { ok: false, errore: 'pieno' };
  }
  scrivi_(t, { stato: si ? 'confermato' : 'rifiutato', risposto_il: new Date() });
  return leggiInvito_(token);
}

function scadiSeServe_(t) {
  const x = t.riga;
  if (x[C.stato] === 'invitato' && x[C.scade_il] && new Date(x[C.scade_il]) < new Date()) {
    scrivi_(t, { stato: 'scaduto' });
  }
}

// ---------------------------------------------------------------- porta
function porta_(r) {
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const errori = Number(cache.get('pin_errori') || 0);
  if (errori >= 10) return { ok: false, errore: 'bloccato' };          // 10 PIN sbagliati: stop per 10 minuti
  if (!props.getProperty('PIN') || String(r.pin) !== props.getProperty('PIN')) {
    cache.put('pin_errori', String(errori + 1), 600);
    return { ok: false, errore: 'pin' };
  }

  const sh = foglio_();
  const righe = dati_(sh);
  const staff = Number(props.getProperty('STAFF_DENTRO') || 0);

  if (r.op === 'staff') {
    const n = Math.max(0, staff + (r.delta > 0 ? 1 : -1));
    props.setProperty('STAFF_DENTRO', String(n));
    return { ok: true, conteggi: conteggi_(righe, n) };
  }
  if (r.op === 'cerca') {
    const q = String(r.q || '').trim().toLowerCase();
    if (q.length < 2) return { ok: true, persone: [], conteggi: conteggi_(righe, staff) };
    const persone = righe.map((x, i) => ({ x, i }))
      .filter(({ x }) => (x[C.nome] + ' ' + x[C.cognome]).toLowerCase().includes(q) ||
                         (x[C.cognome] + ' ' + x[C.nome]).toLowerCase().includes(q))
      .slice(0, 12)
      .map(({ x }) => scheda_(x));
    return { ok: true, persone, conteggi: conteggi_(righe, staff) };
  }
  if (r.op === 'qr') {
    const x = righe.find((y) => y[C.token] && y[C.token] === String(r.token || ''));
    return { ok: true, persona: x ? scheda_(x) : null, conteggi: conteggi_(righe, staff) };
  }
  if (r.op === 'entra') {
    const i = righe.findIndex((y) => y[C.id] === r.id);
    if (i < 0) return { ok: false, errore: 'persona' };
    const x = righe[i];
    if (x[C.stato] === 'entrato') return { ok: false, errore: 'gia_entrato', persona: scheda_(x), conteggi: conteggi_(righe, staff) };
    const c = conteggi_(righe, staff);
    if (c.dentro >= SERATA.capienza) return { ok: false, errore: 'pieno', persona: scheda_(x), conteggi: c };
    if (x[C.stato] !== 'confermato' && !r.forza) return { ok: false, errore: 'non_confermato', persona: scheda_(x), conteggi: c };
    const t = { sh, n: i + 2, riga: x };
    scrivi_(t, { stato: 'entrato', entrato_il: new Date(), note: r.forza ? aggiungiNota_(x[C.note], 'fatto entrare senza conferma') : x[C.note] });
    return { ok: true, persona: scheda_(x), conteggi: conteggi_(righe, staff) };
  }
  return { ok: true, conteggi: conteggi_(righe, staff) };
}

function scheda_(x) {
  return {
    id: x[C.id], nome: x[C.nome], cognome: x[C.cognome],
    eta: eta_(String(x[C.nascita]), SERATA.dataISO),
    nascita: String(x[C.nascita]),
    stato: x[C.stato],
    entrato: x[C.entrato_il] ? Utilities.formatDate(new Date(x[C.entrato_il]), 'Europe/Rome', 'HH:mm') : '',
  };
}

function conteggi_(righe, staff) {
  const n = (s) => righe.filter((x) => x[C.stato] === s).length;
  const ospiti = n('entrato');
  return { ospiti, staff, dentro: ospiti + staff, capienza: SERATA.capienza, attesi: n('confermato'), garantitoFino: SERATA.garantitoFino };
}

// ---------------------------------------------------------------- menu del foglio
function onOpen() {
  SpreadsheetApp.getUi().createMenu('😈 Zonacalda')
    .addItem('1. Prepara il foglio (solo la prima volta)', 'prepara')
    .addSeparator()
    .addItem('Apri la lista', 'apriLista')
    .addItem('Chiudi la lista', 'chiudiLista')
    .addSeparator()
    .addItem('Invia inviti a chi è "da invitare" (12 ore)', 'inviaInviti')
    .addItem('Invia inviti di riserva (30 minuti)', 'inviaRiserva')
    .addItem('Fai scadere gli inviti non confermati', 'scadiInviti')
    .addItem('Avvisa chi non è stato invitato', 'avvisaNonInvitati')
    .addSeparator()
    .addItem('Imposta PIN della porta', 'impostaPin')
    .addItem('Imposta il luogo (lo vede solo chi conferma)', 'impostaLuogo')
    .addItem('Azzera contatore staff', 'azzeraStaff')
    .addSeparator()
    .addItem('Riepilogo', 'riepilogo')
    .addToUi();
}

function prepara() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(FOGLIO) || ss.insertSheet(FOGLIO);
  sh.getRange(1, 1, 1, COL.length).setValues([COL]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(2, C.nascita + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.getRange(2, C.telefono + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  const regola = SpreadsheetApp.newDataValidation().requireValueInList(STATI, true).build();
  sh.getRange(2, C.stato + 1, sh.getMaxRows() - 1, 1).setDataValidation(regola);
  sh.hideColumns(C.token + 1);
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scadiInviti').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert('Foglio pronto. Ora imposta il PIN della porta dal menu 😈 Zonacalda.');
}

function apriLista()  { PropertiesService.getScriptProperties().setProperty('LISTA', 'aperta'); SpreadsheetApp.getActive().toast('lista aperta.'); }
function chiudiLista() { PropertiesService.getScriptProperties().setProperty('LISTA', 'chiusa'); SpreadsheetApp.getActive().toast('lista chiusa.'); }
function azzeraStaff() { PropertiesService.getScriptProperties().setProperty('STAFF_DENTRO', '0'); SpreadsheetApp.getActive().toast('staff: 0'); }

function impostaPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('PIN della porta', 'Scegli un PIN di almeno 6 cifre. Dallo solo a chi sta alla porta.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const pin = r.getResponseText().trim();
  if (!/^\d{6,}$/.test(pin)) return ui.alert('Il PIN deve avere almeno 6 cifre.');
  PropertiesService.getScriptProperties().setProperty('PIN', pin);
  ui.alert('PIN salvato.');
}

function impostaLuogo() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Luogo', 'Scrivi indirizzo o indicazioni. Lo vede solo chi ha confermato l\'invito. Lascia vuoto per nasconderlo.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('LUOGO', r.getResponseText().trim().slice(0, 300));
  ui.alert('Luogo salvato.');
}

function inviaInviti() { invia_(SERATA.oreConferma * 60); }
function inviaRiserva() { invia_(30); }

function invia_(minuti) {
  const sh = foglio_();
  const righe = dati_(sh);
  let email = 0, solo_whatsapp = 0;
  const quota = MailApp.getRemainingDailyQuota();
  righe.forEach((x, i) => {
    if (x[C.stato] !== 'da invitare') return;
    const t = { sh, n: i + 2, riga: x };
    const token = x[C.token] || nuovoToken_();
    const scade = new Date(Date.now() + minuti * 60000);
    const link = SERATA.sito + 'invito/?t=' + token;
    const ora = Utilities.formatDate(scade, 'Europe/Rome', 'HH:mm');
    const testo = minuti <= 60
      ? x[C.nome].toLowerCase() + ', si è liberato un posto. 😈\nhai 30 minuti per confermare: ' + link
      : x[C.nome].toLowerCase() + ', sei dentro. 😈\nconferma entro le ' + ora + ': ' + link;
    const wa = 'https://wa.me/' + String(x[C.telefono]).replace(/\D/g, '') + '?text=' + encodeURIComponent(testo);
    let inviata = false;
    if (email < quota) {
      try {
        MailApp.sendEmail({ to: x[C.email], subject: 'zonacalda.', body: testo + '\n\n23+. invito personale: vale solo per te.', name: 'Zonacalda' });
        inviata = true; email++;
      } catch (err) { console.error(err); }
    }
    if (!inviata) solo_whatsapp++;
    scrivi_(t, { stato: 'invitato', token, invitato_il: new Date(), scade_il: scade, whatsapp: wa });
  });
  SpreadsheetApp.getUi().alert('Inviti preparati.\nEmail inviate: ' + email + '\nDa mandare solo su WhatsApp (quota email finita): ' + solo_whatsapp +
    '\n\nIn ogni riga trovi il link WhatsApp già pronto (colonna "whatsapp"): aprilo e premi invio.');
}

function scadiInviti() {
  const sh = foglio_();
  dati_(sh).forEach((x, i) => scadiSeServe_({ sh, n: i + 2, riga: x }));
}

function avvisaNonInvitati() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Mando il messaggio a tutti quelli ancora "in lista"?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const sh = foglio_();
  let n = 0;
  const quota = MailApp.getRemainingDailyQuota();
  dati_(sh).forEach((x) => {
    if (x[C.stato] !== 'in lista' || n >= quota) return;
    const testo = x[C.prossime_serate] === 'sì'
      ? 'questa volta no. sei in lista per la prossima. 😈'
      : 'questa volta no. grazie per esserti messo in lista. 😈';
    MailApp.sendEmail({ to: x[C.email], subject: 'zonacalda.', body: testo, name: 'Zonacalda' });
    n++;
  });
  ui.alert('Messaggi inviati: ' + n + (n >= quota ? '\nQuota email giornaliera finita: riprova domani per gli altri.' : ''));
}

function riepilogo() {
  const righe = dati_(foglio_());
  const staff = Number(PropertiesService.getScriptProperties().getProperty('STAFF_DENTRO') || 0);
  const txt = STATI.map((s) => s + ': ' + righe.filter((x) => x[C.stato] === s).length).join('\n');
  SpreadsheetApp.getUi().alert('Totale iscritti: ' + righe.length + '\n\n' + txt + '\n\nstaff dentro: ' + staff +
    '\nlista: ' + (listaAperta_() ? 'aperta' : 'chiusa') + '\nemail ancora inviabili oggi: ' + MailApp.getRemainingDailyQuota());
}

// ---------------------------------------------------------------- utilità
function foglio_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FOGLIO);
  if (!sh) throw new Error('Manca il foglio "' + FOGLIO + '": usa il menu 😈 Zonacalda → Prepara il foglio.');
  return sh;
}

function dati_(sh) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, COL.length).getValues() : [];
}

function trova_(token) {
  if (!token || !/^[A-Za-z0-9]{20,40}$/.test(String(token))) return null;
  const sh = foglio_();
  const righe = dati_(sh);
  const i = righe.findIndex((x) => x[C.token] === token);
  return i < 0 ? null : { sh, n: i + 2, riga: righe[i] };
}

function scrivi_(t, campi) {
  Object.keys(campi).forEach((k) => {
    t.riga[C[k]] = campi[k];
    t.sh.getRange(t.n, C[k] + 1).setValue(campi[k]);
  });
}

function nuovoToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
}

function pulisci_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function normalizzaTelefono_(v) {
  let s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+') && s.length >= 9 && s.length <= 10 && s[0] === '3') s = '+39' + s;   // cellulare italiano
  return s.slice(0, 16);
}

function eta_(nascitaISO, alISO) {
  const [a, m, g] = nascitaISO.split('-').map(Number);
  const [A, M, G] = alISO.split('-').map(Number);
  if (!a || !m || !g) return NaN;
  return A - a - ((M < m || (M === m && G < g)) ? 1 : 0);
}

function aggiungiNota_(vecchia, nuova) {
  return vecchia ? vecchia + ' · ' + nuova : nuova;
}
