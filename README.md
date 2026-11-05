# sito-zonacalda

Sito statico di Zonacalda (HTML, CSS, JS, senza build), pubblicato con GitHub Pages.

- `index.html`: home con l'insegna neon che si accende e il conto alla rovescia
- `404.html`: pagina non trovata
- `lista/`: iscrizione alla lista d'attesa (link della storia: `/lista/?da=storia`)
- `invito/`: invito personale con conferma, QR e immagine da scaricare
- `porta/`: programma per chi sta alla porta (PIN)
- `privacy/`: informativa privacy
- `apps-script/`: lo script da incollare nel Foglio Google e le istruzioni (`ISTRUZIONI.md`)
- `js/api.js`: indirizzo dell'app web di Google (il collegamento al foglio)
- `vendor/`: librerie QR (qrcode-generator, MIT; jsQR, Apache-2.0)
- `assets/`: logo e diavoletto (SVG originali, non modificati)
- `tools/build-logo.py`: rigenera gli SVG neon animabili (logo e 00053) dentro `index.html` a partire da `assets/zonacalda-logo-linee.svg` e `assets/zonacalda-00053-linee.svg`

Nessun dato personale va in questo repository: è pubblico.

