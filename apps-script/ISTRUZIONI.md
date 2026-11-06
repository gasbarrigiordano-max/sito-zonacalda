# Zonacalda: come si collega e come si usa

## 1. Collegare il Foglio Google (10 minuti, una volta sola)

1. Su Google Drive crea un **Foglio Google** nuovo, chiamalo per esempio `zonacalda lista`.
   Usa l'account Google del titolare dei dati.
2. Nel foglio: **Estensioni → Apps Script**.
3. Cancella tutto quello che c'è nel file `Codice.gs` e incolla il contenuto di `apps-script/Codice.gs`. Salva.
4. Sempre in Apps Script, accanto a **File** premi **+ → Script**, chiamalo `qrcode` e incolla dentro tutto il contenuto di `vendor/qrcode.js`. Salva.
   Serve a mettere il QR nella mail di conferma. Senza questo file la mail parte lo stesso, ma senza QR.
5. Torna al foglio e ricaricalo: compare il menu **😈 Zonacalda**.
6. **😈 Zonacalda → 1. Prepara il foglio**. Google chiede le autorizzazioni: accetta.
   (Se compare "App non verificata": *Avanzate → Vai a … (non sicura)*. È il tuo script.)
7. **😈 Zonacalda → Imposta PIN della porta** (almeno 6 cifre).
8. In Apps Script: **Esegui il deployment → Nuovo deployment → tipo "App web"**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
   - Copia l'**URL dell'app web** (finisce con `/exec`) e mandalo a Claude: va messo in `js/api.js`.

> Se modifichi lo script dopo, devi fare **Esegui il deployment → Gestisci deployment → modifica → Nuova versione**,
> altrimenti il sito continua a usare la versione vecchia.

## 2. Il calendario

| Quando | Cosa fare nel foglio |
|---|---|
| martedì 19:00 | scegli **da invitare** per chi volete invitare → menu → **Invia inviti a chi è "da invitare"** |
| fino a mercoledì 11.11 alle 19:00 | gli invitati accettano (scadenza uguale per tutti, scritta nella mail e nella pagina) |
| mercoledì dopo le 19:00 | chi non ha accettato passa da solo a **scaduto** (controllo ogni 15 minuti). Per altri inviti: segna nuovi **da invitare** e invia di nuovo (avranno 12 ore) |
| venerdì | menu → **Imposta il luogo**: lo vede solo chi ha confermato |
| sabato 00:30 | se ci sono posti: segna qualcuno **da invitare** → menu → **Invia inviti di riserva (30 minuti)** |
| dopo la serata | menu → **Avvisa chi non è stato invitato** |
| entro 30 giorni | cancella le righe di chi **non** ha scelto "prossime serate" (lo dice l'informativa) |

**Mail di conferma:** quando qualcuno preme "ci sono." riceve subito una mail con il QR. Se la quota email è finita, nella colonna `note` compare "conferma da inviare": il giorno dopo usa il menu **Manda le mail di conferma non partite**.

**Limite email:** un account Gmail normale può mandare circa **100 email al giorno** dallo script.
Per gli altri, nella colonna `whatsapp` di ogni riga c'è il link già pronto: aprilo dal telefono e premi invio.
Dividetevi le righe in 2-3 persone. Il menu **Riepilogo** dice quante email restano oggi.

**Numeri consigliati:** 280 posti per gli ospiti (300 meno 20 di staff). Il sistema accetta al massimo
**315 conferme**, poi risponde "posti finiti.".

## 3. Alla porta

**Prima della serata**
- Ogni persona alla porta apre **zonacaldaclubuse.it/porta/** sul telefono e inserisce il PIN.
- Telefono carico + powerbank, luminosità al massimo, connessione dati attiva.
- Prova una scansione con un invito di prova.
- Menu → **Azzera contatore staff**.

**Per ogni persona**
1. **📷 scansiona** il QR dell'invito (dallo schermo del telefono o dall'immagine scaricata).
2. Guarda il colore:
   - 🟢 **OK · INVITO CONFERMATO** → controlla il **documento** (nome e data di nascita) → **fai entrare ✓**
   - 🔴 **GIÀ ENTRATO** → l'invito è già stato usato: non entra.
   - 🔴 **MENO DI 23 ANNI** → non entra.
   - 🟠 **NON CONFERMATO** → prima delle 00:30 non entra. Dopo le 00:30 entra solo se c'è posto (**fai entrare comunque**).
   - 🔴 **QR NON VALIDO** → non è un nostro invito.
3. Senza QR (telefono scarico): **🔎 cerca nome** → tocca il nome → stesso controllo, documento obbligatorio.

**Staff, DJ, ospiti:** non hanno QR. Quando entrano premete **staff +1**, quando escono definitivamente **staff −1**.

**In alto** vedi `dentro / 300`: ospiti entrati + staff. A 300 il sistema blocca gli ingressi.
**attesi** = confermati non ancora arrivati: dopo le 00:30 quei posti si possono liberare.

**Se salta internet:** usate un secondo telefono con un altro operatore, oppure segnate a mano nome e ora
e aggiornate il foglio dopo.

## 4. Collegare il dominio zonacaldaclubuse.it (registrato su Aruba)

**Dal pannello del registrar (dove hai comprato il dominio), nella gestione DNS:**

| Tipo | Nome | Valore |
|---|---|---|
| CNAME | `www` | `gasbarrigiordano-max.github.io` |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Cancella eventuali altri record A/CNAME per `@` e `www` creati in automatico dal registrar (pagine di parcheggio).

**Su GitHub:** repository → **Settings → Pages → Custom domain** → scrivi `zonacaldaclubuse.it` → **Save** (anche `www.` funzionerà e porterà allo stesso sito).
Quando il controllo DNS diventa verde (da pochi minuti a qualche ora), spunta **Enforce HTTPS**.
