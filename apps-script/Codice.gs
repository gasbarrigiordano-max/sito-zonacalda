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
  etaMinima: 23,                     // per entrare alla serata
  etaIscrizione: 21,                 // per iscriversi alla lista
  capienza: 300,                     // totale, staff compreso
  staffPrevisto: 20,
  confermeMax: 315,                  // oltre questo numero: "posti finiti."
  scadenzaInviti: '2026-11-11T19:00:00+01:00',   // tutti gli inviti si accettano entro mercoledì 11.11 alle 19:00
  oreConferma: 12,                   // solo se si invita dopo quella scadenza: tempo per confermare
  garantitoFino: '2026-11-15T00:30:00+01:00',
  sito: 'https://zonacaldaclubuse.it/',
};

// ---------------------------------------------------------------- testi delle mail
// Potete cambiarli qui. {nome} = nome della persona, {scadenza} = giorno e ora entro cui accettare (es. "mercoledì 11 novembre alle 19:00").
const MAIL = {
  mittente: 'Zonacalda',
  rispondiA: 'info@zonacaldaclubuse.it',
  logo: 'https://zonacaldaclubuse.it/assets/zonacalda-logo-mail.png',
  invito: {
    oggetto: 'sei dentro. 😈',
    titolo: '{nome}, sei dentro.',
    righe: ['sat 14.11 · 23:30', 'accetta entro {scadenza}. dopo, il posto passa a qualcun altro.'],
    tasto: 'ci sono.',
    sotto: 'invito personale: vale solo per te. porta un documento. 23+.',
  },
  riserva: {
    oggetto: 'si è liberato un posto. 😈',
    titolo: '{nome}, si è liberato un posto.',
    righe: ['stasera.', 'hai 30 minuti per confermare.'],
    tasto: 'ci sono.',
    sotto: 'invito personale: vale solo per te. porta un documento. 23+.',
  },
  nonInvitatiProssime: {
    oggetto: 'zonacalda.',
    titolo: 'questa volta no.',
    righe: ['sei in lista per la prossima. 😈'],
  },
  conferma: {
    oggetto: 'ci vediamo. 😈',
    titolo: '{nome}, ci vediamo.',
    righe: ['sat 14.11 · 23:30', 'ingresso garantito fino alle 00:30.'],
    tasto: 'il tuo invito',
    sotto: 'mostra questo QR all\'ingresso con un documento. vale solo per te. 23+.',
  },
  nonInvitati: {
    oggetto: 'zonacalda.',
    titolo: 'questa volta no.',
    righe: ['grazie per esserti messo in lista. 😈'],
  },
  piede: 'ricevi questa mail perché ti sei messo in lista su zonacaldaclubuse.it.',
};

const FOGLIO = 'iscritti';
const COL = [
  'creato', 'id', 'nome', 'cognome', 'nascita', 'email', 'telefono', 'instagram',
  'fonte', 'prossime_serate', 'stato', 'token', 'invitato_il', 'scade_il',
  'risposto_il', 'entrato_il', 'whatsapp', 'note', 'wa_inviato',
];
const STATI = ['in lista', 'da invitare', 'invitato', 'confermato', 'rifiutato', 'scaduto', 'entrato', 'escluso'];
const C = Object.fromEntries(COL.map((n, i) => [n, i]));   // indice di colonna (da 0)

// staff: l'organizzatore scrive nome e cognome di chi è abilitato; il resto lo compila la pagina /staff
const FOGLIO_STAFF = 'staff';
const COL_STAFF = ['nome', 'cognome', 'stato', 'telefono', 'registrato_il', 'entrato_il', 'note', 'id', 'token', 'wa_inviato'];
const STATI_STAFF = ['abilitato', 'registrato', 'entrato', 'escluso'];
const CS = Object.fromEntries(COL_STAFF.map((n, i) => [n, i]));

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
      case 'staff':    return out_(registraStaff_(req));
      case 'pass':     return out_(leggiPass_(req.token));
      default:         return out_({ ok: false, errore: 'azione' });
    }
  } catch (err) {
    console.error(err);
    return out_({ ok: false, errore: 'interno' });
  } finally {
    lock.releaseLock();
  }
}

const VERSIONE = 'righe-rosse-1';                 // si legge aprendo l'indirizzo /exec nel browser

function doGet() {
  return out_({ ok: true, servizio: 'zonacalda', versione: VERSIONE });
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

  // dai 21 anni si può chiedere: chi ha meno di 23 viene segnato nelle note, poi decide l'organizzatore
  const eta = eta_(nascita, SERATA.dataISO);
  if (!(eta >= 0) || eta > 99) return { ok: false, errore: 'nascita' };
  if (eta < SERATA.etaIscrizione) return { ok: false, errore: 'eta' };      // chi è più giovane non viene salvato

  const sh = foglio_();
  const righe = dati_(sh);
  const cifre = (v) => String(v || '').replace(/\D/g, '').replace(/^39(?=3\d{8,9}$)/, '');
  if (righe.some((x) => String(x[C.email]).toLowerCase() === email || cifre(x[C.telefono]) === cifre(telefono))) {
    return { ok: true, gia: true };
  }

  const riga = new Array(COL.length).fill('');
  riga[C.creato] = new Date();
  riga[C.id] = Utilities.getUuid().slice(0, 8);
  riga[C.nome] = nome;
  riga[C.cognome] = cognome;
  riga[C.nascita] = "'" + nascita;          // l'apostrofo tiene la data come testo (il foglio la trasformerebbe)
  riga[C.email] = email;
  riga[C.telefono] = "'" + telefono;        // e tiene il + del prefisso
  riga[C.instagram] = instagram ? '@' + instagram : '';
  riga[C.fonte] = fonte;
  riga[C.prossime_serate] = r.prossime === true ? 'sì' : 'no';
  riga[C.stato] = 'in lista';
  if (eta < SERATA.etaMinima) riga[C.note] = 'meno di ' + SERATA.etaMinima + ' anni (' + eta + ')';
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
    ris.luogo = PropertiesService.getScriptProperties().getProperty('LUOGO') || 'via dei prati 4, civitavecchia';
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
  if (si) mandaConferma_(t);
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
  if (r.op === 'elenco') {
    // tutti gli invitati, per cercarli sul telefono della porta senza aspettare il foglio
    const persone = righe.filter((x) => x[C.token]).map((x) => Object.assign(scheda_(x), { token: String(x[C.token]) }))
      .concat(datiStaff_().filter((x) => x[CS.token]).map((x) => Object.assign(schedaStaff_(x), { token: String(x[CS.token]) })));
    return { ok: true, persone, conteggi: conteggi_(righe, staff) };
  }
  if (r.op === 'qr') {
    const x = righe.find((y) => y[C.token] && String(y[C.token]) === String(r.token || ''));
    const s = x ? null : datiStaff_().find((y) => y[CS.token] && String(y[CS.token]) === String(r.token || ''));
    return { ok: true, persona: x ? scheda_(x) : s ? schedaStaff_(s) : null, conteggi: conteggi_(righe, staff) };
  }
  if (r.op === 'entra' && /^s/.test(String(r.id))) {           // staff con il pass
    const sh2 = foglioStaff_();
    const ss = sh2 ? datiStaff_() : [];
    const i = ss.findIndex((y) => String(y[CS.id]) === String(r.id));
    if (i < 0) return { ok: false, errore: 'persona' };
    const x = ss[i];
    if (x[CS.stato] === 'entrato') return { ok: false, errore: 'gia_entrato', persona: schedaStaff_(x), conteggi: conteggi_(righe, staff) };
    if (x[CS.stato] !== 'registrato') return { ok: false, errore: 'persona', conteggi: conteggi_(righe, staff) };
    const c = conteggi_(righe, staff);
    if (c.dentro >= SERATA.capienza) return { ok: false, errore: 'pieno', persona: schedaStaff_(x), conteggi: c };
    scriviStaff_(sh2, i, { stato: 'entrato', entrato_il: new Date() }, x);
    return { ok: true, persona: schedaStaff_(x), conteggi: conteggi_(righe, staff) };
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
    eta: eta_(dataISO_(x[C.nascita]), SERATA.dataISO),
    nascita: dataISO_(x[C.nascita]),
    stato: x[C.stato],
    entrato: x[C.entrato_il] ? Utilities.formatDate(new Date(x[C.entrato_il]), 'Europe/Rome', 'HH:mm') : '',
  };
}

function schedaStaff_(x) {
  return {
    id: String(x[CS.id]), nome: x[CS.nome], cognome: x[CS.cognome], tipo: 'staff', stato: x[CS.stato],
    entrato: x[CS.entrato_il] ? Utilities.formatDate(new Date(x[CS.entrato_il]), 'Europe/Rome', 'HH:mm') : '',
  };
}

function conteggi_(righe, staffAMano) {
  const n = (s) => righe.filter((x) => x[C.stato] === s).length;
  const ospiti = n('entrato');
  const staff = staffAMano + datiStaff_().filter((x) => x[CS.stato] === 'entrato').length;   // + chi è entrato col pass
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
    .addItem('Invia inviti a chi è "da invitare"', 'inviaInviti')
    .addItem('Invia inviti di riserva (30 minuti)', 'inviaRiserva')
    .addItem('Fai scadere gli inviti non confermati', 'scadiInviti')
    .addItem('Manda le mail di conferma non partite', 'rimandaConferme')
    .addItem('Avvisa chi non è stato invitato', 'avvisaNonInvitati')
    .addSeparator()
    .addItem('Imposta PIN della porta', 'impostaPin')
    .addItem('Imposta il luogo (lo vede solo chi conferma)', 'impostaLuogo')
    .addItem('Azzera contatore staff', 'azzeraStaff')
    .addItem('Prepara il foglio staff', 'preparaStaff')
    .addItem('Pannello pass staff WhatsApp', 'pannelloStaff')
    .addSeparator()
    .addItem('Pannello invii WhatsApp', 'pannelloWhatsApp')
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
  sh.getRange(2, C.token + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  const regola = SpreadsheetApp.newDataValidation().requireValueInList(STATI, true).build();
  sh.getRange(2, C.stato + 1, sh.getMaxRows() - 1, 1).setDataValidation(regola);
  sh.hideColumns(C.token + 1);
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scadiInviti').timeBased().everyMinutes(15).create();
  coloraInviati_(sh, C.wa_inviato, COL.length);
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

function inviaInviti() {
  // scadenza fissa uguale per tutti; se è già passata (o manca meno di un'ora), 12 ore da adesso
  const fissa = new Date(SERATA.scadenzaInviti);
  invia_(fissa.getTime() - Date.now() > 3600000 ? fissa : new Date(Date.now() + SERATA.oreConferma * 3600000), false);
}
function inviaRiserva() { invia_(new Date(Date.now() + 30 * 60000), true); }

function invia_(scade, riserva) {
  const sh = foglio_();
  const righe = dati_(sh);
  let email = 0, solo_whatsapp = 0;
  const quota = MailApp.getRemainingDailyQuota();
  righe.forEach((x, i) => {
    if (x[C.stato] !== 'da invitare') return;
    const t = { sh, n: i + 2, riga: x };
    const token = x[C.token] || nuovoToken_();
    const link = SERATA.sito + 'invito/?t=' + token;
    const scadenza = quando_(scade);
    const m = componiMail_(riserva ? MAIL.riserva : MAIL.invito, { nome: x[C.nome], scadenza }, link);
    const wa = 'https://wa.me/' + normalizzaTelefono_(x[C.telefono]).replace(/\D/g, '') + '?text=' + encodeURIComponent(m.testo);
    let inviata = false;
    if (email < quota) {
      try {
        manda_(x[C.email], m);
        inviata = true; email++;
      } catch (err) { console.error(err); }
    }
    if (!inviata) solo_whatsapp++;
    scrivi_(t, { stato: 'invitato', token, invitato_il: new Date(), scade_il: scade, whatsapp: wa });
  });
  // avviso che non blocca lo script (una finestra "OK" lasciata aperta lo faceva andare in timeout)
  SpreadsheetApp.getActive().toast('email inviate: ' + email + (solo_whatsapp ? ' · solo WhatsApp: ' + solo_whatsapp : '') +
    '. ora apri il Pannello invii WhatsApp.', '😈 inviti pronti', 10);
  pannelloWhatsApp();
}

// ---------------------------------------------------------------- pannello invii WhatsApp
// Riquadro a lato: per ogni invitato un tasto che apre WhatsApp con il messaggio già scritto.
function pannelloWhatsApp() {
  const sh = foglio_();
  if (sh.getRange(1, C.wa_inviato + 1).getValue() !== 'wa_inviato') sh.getRange(1, C.wa_inviato + 1).setValue('wa_inviato').setFontWeight('bold');
  coloraInviati_(sh, C.wa_inviato, COL.length);
  const html = HtmlService.createHtmlOutput(pannello_('inviti WhatsApp', 'elencoWhatsApp', 'segnaWhatsApp')).setTitle('😈 inviti WhatsApp');
  SpreadsheetApp.getUi().showSidebar(html);
}

// la riga diventa rossa quando l'invito (o il pass) è stato mandato su WhatsApp: colonna wa_inviato piena
const ROSSO_INVIATO = '#f28b82';
function coloraInviati_(sh, colonna, larghezza) {
  try {
    const lettera = String.fromCharCode(65 + colonna);                // colonne entro la Z
    const formula = '=$' + lettera + '2<>""';
    const area = sh.getRange(2, 1, sh.getMaxRows() - 1, larghezza);
    const altre = sh.getConditionalFormatRules().filter((r) => {
      const c = r.getBooleanCondition && r.getBooleanCondition();
      return !(c && String(c.getCriteriaValues()[0]) === formula);   // tolgo la regola vecchia, se c'era
    });
    const regola = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
      .setBackground(ROSSO_INVIATO).setRanges([area]).build();
    sh.setConditionalFormatRules(altre.concat(regola));
  } catch (err) {
    console.error('colore righe', err);                               // il colore non deve mai bloccare gli inviti
  }
}

function pannello_(titolo, elenco, segna) {
  return PANNELLO_HTML.replace('__TITOLO__', titolo).replace('__ELENCO__', elenco).replace('__SEGNA__', segna);
}

// pass staff: stesso pannello, un messaggio WhatsApp con il link al pass per ogni registrato
function pannelloStaff() {
  const sh = foglioStaff_();
  if (!sh) return SpreadsheetApp.getUi().alert('Manca la scheda "staff": usa prima "Prepara il foglio staff".');
  if (sh.getRange(1, CS.wa_inviato + 1).getValue() !== 'wa_inviato') sh.getRange(1, CS.wa_inviato + 1).setValue('wa_inviato').setFontWeight('bold');
  coloraInviati_(sh, CS.wa_inviato, COL_STAFF.length);
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(pannello_('pass staff WhatsApp', 'elencoStaffWhatsApp', 'segnaStaffWhatsApp')).setTitle('😈 pass staff'));
  const mancano = datiStaff_().filter((x) => x[CS.nome] && !x[CS.token] && x[CS.stato] !== 'escluso').map((x) => x[CS.nome] + ' ' + x[CS.cognome]);
  if (mancano.length) SpreadsheetApp.getActive().toast(mancano.join(', '), 'non ancora registrati: ' + mancano.length, 20);
}

function elencoStaffWhatsApp() {
  return datiStaff_().filter((x) => x[CS.token] && x[CS.stato] !== 'escluso').map((x) => {
    const tel = normalizzaTelefono_(x[CS.telefono]);
    // niente emoji: WhatsApp Web le rovina quando arrivano da un link
    const pass = SERATA.sito + 'staff/?t=' + x[CS.token];
    const testo = String(x[CS.nome]).toLowerCase() + ', sei dello staff.\nsat 14.11 · palazzo podestà\n\nil tuo pass:\n' +
      pass + '\n\nmostralo all\'ingresso. vale solo per te.';
    return { id: String(x[CS.id]), nome: String(x[CS.nome]) + ' ' + String(x[CS.cognome]), tel,
             link: 'https://wa.me/' + tel.replace(/\D/g, '') + '?text=' + encodeURIComponent(testo), foto: pass, inviato: !!x[CS.wa_inviato] };
  });
}

function segnaStaffWhatsApp(id, si) {
  const sh = foglioStaff_();
  const i = datiStaff_().findIndex((x) => String(x[CS.id]) === String(id));
  if (i < 0) return false;
  scriviStaff_(sh, i, { wa_inviato: si ? new Date() : '' });
  return true;
}

function elencoWhatsApp() {
  return dati_(foglio_())
    .filter((x) => x[C.stato] === 'invitato' && x[C.whatsapp])
    .map((x) => ({ id: String(x[C.id]), nome: String(x[C.nome]) + ' ' + String(x[C.cognome]), tel: String(x[C.telefono]).replace(/^'/, ''),
                   link: String(x[C.whatsapp]), inviato: !!x[C.wa_inviato] }));
}

function segnaWhatsApp(id, si) {
  const sh = foglio_();
  const righe = dati_(sh);
  const i = righe.findIndex((x) => String(x[C.id]) === String(id));
  if (i < 0) return false;
  scrivi_({ sh, n: i + 2, riga: righe[i] }, { wa_inviato: si ? new Date() : '' });
  return true;
}

const PANNELLO_HTML = `<!doctype html><html><head><base target="_blank"><style>
  body{font:14px system-ui,-apple-system,sans-serif;margin:0;padding:12px;color:#222}
  h3{margin:0 0 4px} .su{color:#666;margin:0 0 12px;font-size:12px}
  .riga{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee}
  .riga.fatto{opacity:.45} .nome{flex:1;min-width:0} .nome b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nome small{color:#888} button{border:0;border-radius:8px;padding:8px 10px;font-weight:600;cursor:pointer}
  .apri{background:#25d366;color:#fff} .no{background:#eee;color:#555;padding:8px} .foto{background:#222;color:#fff}
  .barra{position:sticky;top:0;background:#fff;padding-bottom:8px}
  .prossimo{width:100%;background:#25d366;color:#fff;font-size:15px;padding:12px}
</style></head><body>
<div class="barra"><h3>__TITOLO__</h3><p class="su" id="conto">carico…</p>
<button class="prossimo" id="prossimo">apri il prossimo ▸</button></div>
<div id="lista"></div>
<script>
let elenco = [];
const $ = (id) => document.getElementById(id);
function disegna() {
  const da = elenco.filter((p) => !p.inviato).length;
  $('conto').textContent = da + ' da mandare · ' + (elenco.length - da) + ' mandati';
  $('prossimo').disabled = !da;
  $('lista').innerHTML = '';
  elenco.forEach((p) => {
    const r = document.createElement('div'); r.className = 'riga' + (p.inviato ? ' fatto' : '');
    r.innerHTML = '<div class="nome"><b></b><small></small></div>';
    r.querySelector('b').textContent = p.nome; r.querySelector('small').textContent = p.tel;
    const a = document.createElement('button'); a.className = 'apri'; a.textContent = p.inviato ? 'di nuovo' : 'apri';
    a.onclick = () => apri(p);
    const n = document.createElement('button'); n.className = 'no'; n.title = 'segna come non mandato'; n.textContent = p.inviato ? '↺' : '✓';
    n.onclick = () => segna(p, !p.inviato);
    const fo = document.createElement('button'); fo.className = 'foto'; fo.title = 'apre il pass: premi "copia foto" e incollala nella chat'; fo.textContent = 'foto';
    fo.onclick = () => window.open(p.foto, '_blank');
    if (p.foto) r.append(a, fo, n); else r.append(a, n);
    $('lista').appendChild(r);
  });
}
function segna(p, si) { p.inviato = si; disegna(); google.script.run.__SEGNA__(p.id, si); }
function apri(p) { window.open(p.link, '_blank'); segna(p, true); }
$('prossimo').onclick = () => { const p = elenco.find((x) => !x.inviato); if (p) apri(p); };
google.script.run.withSuccessHandler((e) => { elenco = e; disegna(); }).__ELENCO__();
</script></body></html>`;

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
    manda_(x[C.email], componiMail_(x[C.prossime_serate] === 'sì' ? MAIL.nonInvitatiProssime : MAIL.nonInvitati, { nome: x[C.nome] }));
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

// ---------------------------------------------------------------- mail
function componiMail_(tpl, dati, link, extra) {
  extra = extra || {};
  const riempi = (s) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k === 'nome' ? String(dati.nome || '').toLowerCase() : dati[k] || ''));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titolo = riempi(tpl.titolo);
  const righe = (tpl.righe || []).map(riempi).concat(extra.luogo ? [extra.luogo] : []);
  const sotto = tpl.sotto ? riempi(tpl.sotto) : '';

  // versione testo (anche per WhatsApp)
  const testo = [titolo, ''].concat(righe).concat(link ? ['', link] : []).concat(sotto ? ['', sotto] : []).join('\n');

  // versione grafica: tabelle e stili in linea, come vogliono i programmi di posta
  const html =
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>' +
    '<body style="margin:0;padding:0;background:#050505;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +
    '<tr><td align="center" style="padding:0 0 8px;"><img src="' + MAIL.logo + '" width="420" alt="ZONACALDA" style="display:block;width:100%;max-width:440px;height:auto;border:0;"></td></tr>' +
    '<tr><td align="center" style="padding:8px 8px 4px;color:#f0eded;font-size:28px;line-height:1.25;font-weight:700;">' + esc(titolo) + '</td></tr>' +
    righe.map((r, i) => '<tr><td align="center" style="padding:6px 8px 0;color:' + (i === 0 ? '#9b9696' : '#f0eded') + ';font-size:' + (i === 0 ? '16' : '17') + 'px;line-height:1.5;">' + esc(r) + '</td></tr>').join('') +
    (link ? '<tr><td align="center" style="padding:28px 8px 8px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#ff2634" style="border-radius:12px;">' +
      '<a href="' + link + '" style="display:inline-block;padding:16px 44px;color:#ffffff;font-size:18px;font-weight:700;text-decoration:none;border-radius:12px;">' + esc(tpl.tasto || 'apri.') + '</a>' +
      '</td></tr></table></td></tr>' : '') +
    (extra.qr ? '<tr><td align="center" style="padding:24px 8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffffff" style="padding:14px;border-radius:14px;">' +
      '<img src="cid:qr" width="240" height="240" alt="QR per l\'ingresso" style="display:block;width:240px;height:240px;border:0;"></td></tr></table></td></tr>' : '') +
    (sotto ? '<tr><td align="center" style="padding:20px 8px 0;color:#9b9696;font-size:14px;line-height:1.5;">' + esc(sotto) + '</td></tr>' : '') +
    '<tr><td align="center" style="padding:36px 8px 0;color:#6f6a6a;font-size:12px;line-height:1.5;">' + esc(MAIL.piede) +
    '<br><a href="mailto:' + MAIL.rispondiA + '" style="color:#6f6a6a;">' + MAIL.rispondiA + '</a></td></tr>' +
    '</table></td></tr></table></body></html>';

  return { oggetto: riempi(tpl.oggetto), testo, html };
}

// "mercoledì 11 novembre alle 19:00" (ora italiana)
function quando_(d) {
  const giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const f = (s) => Number(Utilities.formatDate(d, 'Europe/Rome', s));
  return giorni[f('u') % 7] + ' ' + f('d') + ' ' + mesi[f('M') - 1] + ' alle ' + Utilities.formatDate(d, 'Europe/Rome', 'HH:mm');
}

// mail di conferma con il QR (immagine nel testo + allegato da salvare)
function mandaConferma_(t) {
  const x = t.riga;
  try {
    const luogo = PropertiesService.getScriptProperties().getProperty('LUOGO') || 'via dei prati 4, civitavecchia';
    const link = SERATA.sito + 'invito/?t=' + x[C.token];
    const conQr = typeof qrcode === 'function';            // se manca il file "qrcode", parte senza immagine ma con il link
    const m = componiMail_(MAIL.conferma, { nome: x[C.nome] }, link, { luogo, qr: conQr });
    const opz = { to: x[C.email], subject: m.oggetto, body: m.testo, htmlBody: m.html, name: MAIL.mittente, replyTo: MAIL.rispondiA };
    if (conQr) {
      const qr = qrBlob_(String(x[C.token]));
      opz.inlineImages = { qr: qr };
      opz.attachments = [qr.copyBlob().setName('zonacalda-ingresso.gif')];
    }
    MailApp.sendEmail(opz);
    scrivi_(t, { note: togliNota_(x[C.note], 'conferma da inviare') });
  } catch (err) {
    console.error(err);                                     // quota finita o altro: si rimanda dal menu
    scrivi_(t, { note: aggiungiNota_(togliNota_(x[C.note], 'conferma da inviare'), 'conferma da inviare') });
  }
}

function rimandaConferme() {
  const sh = foglio_();
  let n = 0;
  dati_(sh).forEach((x, i) => {
    if (x[C.stato] !== 'confermato' || !String(x[C.note]).includes('conferma da inviare')) return;
    const t = { sh, n: i + 2, riga: x };
    mandaConferma_(t);
    if (!String(t.riga[C.note]).includes('conferma da inviare')) n++;
  });
  SpreadsheetApp.getUi().alert('Mail di conferma inviate: ' + n + '\nEmail ancora inviabili oggi: ' + MailApp.getRemainingDailyQuota());
}

// QR come immagine GIF, generato qui (serve il file "qrcode" nel progetto: vedi ISTRUZIONI.md)
function qrBlob_(testo) {
  const q = qrcode(0, 'M');
  q.addData(testo);
  q.make();
  const b64 = q.createDataURL(8, 4).split(',')[1];
  return Utilities.newBlob(Utilities.base64Decode(b64), 'image/gif', 'qr.gif');
}

function togliNota_(nota, testo) {
  return String(nota || '').split(' · ').filter((s) => s && s !== testo).join(' · ');
}

function manda_(a, m) {
  MailApp.sendEmail({ to: a, subject: m.oggetto, body: m.testo, htmlBody: m.html, name: MAIL.mittente, replyTo: MAIL.rispondiA });
}

// ---------------------------------------------------------------- staff
// Si registra solo chi è già scritto (nome e cognome) nel foglio "staff". Nessun limite d'età.
function registraStaff_(r) {
  if (r.sito) return { ok: true, gia: true };                 // campo trappola per i bot
  const nome = pulisci_(r.nome, 60), cognome = pulisci_(r.cognome, 60);
  const telefono = normalizzaTelefono_(r.telefono);
  if (!nome || !cognome) return { ok: false, errore: 'campi' };
  if (telefono.replace(/\D/g, '').length < 8) return { ok: false, errore: 'telefono' };
  if (r.informativa !== true) return { ok: false, errore: 'informativa' };

  // troppi tentativi con nomi sbagliati: stop per 10 minuti
  const cache = CacheService.getScriptCache();
  const tentativi = Number(cache.get('staff_errori') || 0);
  if (tentativi >= 30) return { ok: false, errore: 'bloccato' };

  const sh = foglioStaff_();
  if (!sh) return { ok: false, errore: 'non_abilitato' };
  const righe = datiStaff_();
  const n = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const i = righe.findIndex((x) => n(x[CS.cognome]) && x[CS.stato] !== 'escluso' &&
    ((n(x[CS.nome]) === n(nome) && n(x[CS.cognome]) === n(cognome)) || (n(x[CS.nome]) === n(cognome) && n(x[CS.cognome]) === n(nome))));
  if (i < 0) { cache.put('staff_errori', String(tentativi + 1), 600); return { ok: false, errore: 'non_abilitato' }; }

  const x = righe[i];
  if (x[CS.token]) return { ok: true, gia: true };            // già registrato: il pass lo manda l'organizzatore su WhatsApp
  const token = 's' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 31);
  const id = 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 7);
  scriviStaff_(sh, i, { telefono: "'" + telefono, token, id, registrato_il: new Date(), stato: 'registrato' }, x);
  return { ok: true, nome: x[CS.nome] };
}

function leggiPass_(token) {
  if (!token || !/^s[a-f0-9]{20,40}$/.test(String(token))) return { ok: false, errore: 'pass' };
  const x = datiStaff_().find((y) => String(y[CS.token]) === String(token));
  if (!x || x[CS.stato] === 'escluso') return { ok: false, errore: 'pass' };
  return { ok: true, nome: x[CS.nome], cognome: x[CS.cognome], stato: x[CS.stato] };
}

function preparaStaff() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(FOGLIO_STAFF) || ss.insertSheet(FOGLIO_STAFF);
  sh.getRange(2, CS.telefono + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  sh.getRange(2, CS.token + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  const sistemate = riordinaStaff_(sh);           // si può rifare quando si vuole: i dati restano
  sh.setFrozenRows(1);
  sh.getRange(2, CS.stato + 1, sh.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATI_STAFF, true).build());
  sh.hideColumns(CS.id + 1, 2);
  coloraInviati_(sh, CS.wa_inviato, COL_STAFF.length);
  SpreadsheetApp.getUi().alert('Foglio "staff" pronto.' + (sistemate ? '\nRighe sistemate (registrate con la versione vecchia): ' + sistemate + '.' : '') + '\nScrivi nome e cognome di chi può registrarsi (colonne A e B), stato "abilitato".\nPagina da mandare allo staff: ' + SERATA.sito + 'staff/\nI pass si mandano dal menu: Pannello pass staff WhatsApp.');
}

// rimette le colonne nell'ordine giusto, anche se le righe sono state scritte da una versione vecchia (con l'email)
function riordinaStaff_(sh) {
  const n = sh.getLastRow();
  if (n < 1) { sh.getRange(1, 1, 1, COL_STAFF.length).setValues([COL_STAFF]).setFontWeight('bold'); return 0; }
  const m = Math.max(sh.getLastColumn(), COL_STAFF.length);
  const tutto = sh.getRange(1, 1, n, m).getValues();
  const testa = tutto[0].map((h) => String(h).trim());
  const conIntestazione = testa.includes('nome') && testa.includes('cognome');
  const vuoto = (v) => v === '' || v == null;
  let sistemate = 0;
  const righe = (conIntestazione ? tutto.slice(1) : tutto).filter((r) => !r.every(vuoto)).map((r) => {
    let o = {};
    if (conIntestazione) testa.forEach((h, i) => { if (h) o[h] = r[i]; });
    else o = { nome: r[0], cognome: r[1], stato: r[2] };
    if (!testa.includes('email') && String(o.registrato_il || '').includes('@')) {
      // scritte con l'email ma sotto le intestazioni nuove: tutto spostato di una colonna
      o = { nome: r[0], cognome: r[1], stato: r[2], telefono: r[3], registrato_il: r[5], entrato_il: r[6], note: r[7], id: r[8], token: r[9] };
      sistemate++;
    } else if (o.email) sistemate++;
    if (!o.stato) o.stato = 'abilitato';
    if (o.telefono) o.telefono = "'" + String(o.telefono).replace(/^'/, '');
    if (o.token) o.token = "'" + String(o.token).replace(/^'/, '');
    return COL_STAFF.map((k) => (o[k] === undefined ? '' : o[k]));
  });
  sh.getRange(1, 1, n, m).clearContent();
  sh.getRange(1, 1, 1, COL_STAFF.length).setValues([COL_STAFF]).setFontWeight('bold');
  if (righe.length) sh.getRange(2, 1, righe.length, COL_STAFF.length).setValues(righe);
  return sistemate;
}

function foglioStaff_() {
  return SpreadsheetApp.getActive().getSheetByName(FOGLIO_STAFF);
}

function datiStaff_() {
  const sh = foglioStaff_();
  if (!sh) return [];
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, COL_STAFF.length).getValues() : [];
}

function scriviStaff_(sh, i, campi, riga) {
  Object.keys(campi).forEach((k) => {
    sh.getRange(i + 2, CS[k] + 1).setValue(campi[k]);
    if (riga) riga[CS[k]] = typeof campi[k] === 'string' ? campi[k].replace(/^'/, '') : campi[k];
  });
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
  const i = righe.findIndex((x) => String(x[C.token]) === String(token));
  return i < 0 ? null : { sh, n: i + 2, riga: righe[i] };
}

function scrivi_(t, campi) {
  Object.keys(campi).forEach((k) => {
    t.riga[C[k]] = campi[k];
    t.sh.getRange(t.n, C[k] + 1).setValue(campi[k]);
  });
}

function nuovoToken_() {
  // inizia sempre con una lettera: il foglio non lo può scambiare per un numero
  return 'z' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 31);
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

// la data di nascita può essere testo "2001-02-02" o una data del foglio: torna sempre "aaaa-mm-gg"
function dataISO_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Rome', 'yyyy-MM-dd');
  const s = String(v || '').replace(/^'/, '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM-dd');
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
