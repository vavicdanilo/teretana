# Forma — dnevnik treninga

Aplikacija za lični dnevnik treninga: vježbe, serije, ponavljanja, težine i pregled napretka. Interfejs je na srpskom jeziku, sa latinicom i težinama u kilogramima.

## Mogućnosti

- Unos, pregled, izmjena i brisanje treninga sa datumom i bilješkama.
- Serije sa decimalnom kilažom, uključujući decimalni zarez, i brojem ponavljanja; dodavanje i uklanjanje serija i vježbi.
- Pregled treninga, ukupnog volumena, serija i aktivnosti tokom sedmice.
- Grafikon napretka po vježbi, izbor perioda, lični rekord i tabela prethodnih rezultata.
- Pretraga istorije treninga i biblioteke vježbi; gotovi obrasci za gornji dio, donji dio i cijelo tijelo.
- Biblioteka sa 156 ugrađenih vježbi u 8 mišićnih grupa i dodavanje sopstvenih vježbi. Potpun spisak je u [VJEZBE.md](VJEZBE.md).
- Lične fotografije sprava povezane sa vježbama, vidljive u biblioteci, unosu treninga i pregledu napretka.
- Izvoz i uvoz JSON rezervne kopije sa treninzima, sopstvenim vježbama i fotografijama.

## Pokretanje na svom računaru

Preuzmi kod preko GitHub **Code → Download ZIP** i raspakuj ga. Instaliraj Node.js 22 ili noviji sa [nodejs.org](https://nodejs.org/), pa u raspakovanom folderu pokreni `npm start`. U pregledniku unesi `http://localhost:3000`. Terminal ostavi otvoren dok koristiš aplikaciju; `Ctrl+C` zaustavlja server. Nije potrebno pokretati `npm install`.

Na Windowsu možeš dvokliknuti `Pokreni-Windows.bat`. Na macOS-u koristi `Pokreni-macOS.command` ili terminal, a na Linuxu `bash pokreni-linux.sh`. Ako PowerShell blokira `npm.ps1`, pokreni `npm.cmd start` ili koristi Command Prompt. Potpuno uputstvo je u `OTVORI-ME.txt`.

Ne otvaraj `index.html` direktno dvoklikom — aplikacija koristi lokalni server. Izvorni kod ne uključuje lične treninge i slike iz preglednika; njih prenesi izvozom i uvozom rezervne kopije.

## Dodavanje svoje vježbe

U odjeljku **Vježbe** klikni **Dodaj svoju vježbu**, unesi naziv i izaberi mišićnu grupu. Tokom unosa treninga ista mogućnost je dostupna kao **+ Dodaj svoju vježbu…** u izboru vježbe. Nakon čuvanja dostupna je u biblioteci, unosu treninga i izboru za grafikon napretka.

Fotografiju svoje sprave dodaj opcijom **Dodaj svoju sliku** uz vježbu. I ugrađene i sopstvene vježbe mogu imati fotografiju, serije, kilažu, ponavljanja i istoriju napretka. Sopstvene vježbe pripadaju tvom lokalnom dnevniku; za prenos na drugi uređaj izvezi rezervnu kopiju.

## Razvoj

Potreban je Node.js 22 ili noviji. Aplikacija nema spoljne pakete, bazu podataka niti obavezne API ključeve, pa instalacija zavisnosti nije potrebna.

```sh
# Otvori terminal u folderu koji sadrži package.json
npm run dev
```

Server koristi port 3000 i adresu `0.0.0.0`. Drugi port možeš odabrati sa `npm run dev -- --port 3001` ili promjenljivom `PORT`.

```sh
npm test
npm run build
node server.mjs --dist --port 3001
```

Testovi provjeravaju validaciju treninga, obračun napretka i provjere lokalnog čuvanja fotografija. Build provjerava sintaksu JavaScript datoteka i kopira aplikaciju u `dist/`. Za objavljivanje se mogu koristiti statičke datoteke iz `dist/`, uz očuvane putanje `src/` i `public/`; ugrađeni server je namijenjen lokalnom razvoju i provjeri.

Opciona provjera kroz stvarni preglednik koristi Playwright i Chromium, koji su dostupni u pripremljenom cloud okruženju. Dok aplikacija radi, pokreni `npm run test:browser`. Provjerava unos, izmjenu i brisanje treninga, decimalne težine, grafikon, fotografije i njihovo trajno čuvanje, izvoz/uvoz i mobilni prikaz, u odvojenom profilu bez diranja ličnih podataka. Van ovog okruženja prvo obezbijedi Playwright i Chromium; putanju preglednika možeš zadati kroz `CHROMIUM_PATH`, a adresu aplikacije kroz `FORMA_TEST_URL`.

## Podaci

Treninzi i sopstvene vježbe čuvaju se u `localStorage`, a fotografije sprava u `IndexedDB`, lokalno u pregledniku na konkretnom uređaju i adresi aplikacije. Nema naloga, serverskog čuvanja ni sinhronizacije između uređaja. Brisanje podataka preglednika može obrisati evidenciju. U odjeljku **Podaci i postavke** izvezi rezervnu kopiju prije promjene uređaja, preglednika ili adrese aplikacije.

Fotografije mogu biti JPEG, PNG ili WebP do 12 MB. Aplikacija ih smanjuje na najviše 1024 piksela po dužoj strani i čuva kao JPEG. Fotografije se ne šalju serveru.

Izvoz pravi Forma JSON rezervnu kopiju **verzije 2**, koja sadrži treninge, sopstvene vježbe i fotografije. Uvoz prihvata kopije do 30 MB, uključujući stare kopije **verzije 1** sa treninzima i fotografijama. Kopiju verzije 2 uvozi u ovu ili noviju verziju aplikacije; stara aplikacija podržava samo verziju 1.

Nakon potvrde uvoz zamjenjuje postojeće treninge, sopstvene vježbe i fotografije; prije uvoza sačuvaj trenutnu kopiju. Neispravne vježbe, treninzi ili fotografije odbijaju se prije upisa. Uvoz stare kopije verzije 1 zamjenjuje evidenciju bez sopstvenih vježbi, jer ih stari format ne sadrži. Postojeći treninzi i fotografije ugrađenih vježbi ostaju povezani pri ažuriranju aplikacije na istoj adresi, bez posebnog uvoza.

Početni demo prikaz jasno je označen i sadrži primjere, koji nijesu stvarni rezultati korisnika i ne izvoze se u rezervnoj kopiji. Dugme **Započni svoj dnevnik** otvara praznu evidenciju; prvi sačuvani trening takođe isključuje demo. Demo se ponovo može uključiti u odjeljku **Podaci i postavke**.

Volumen je zbir `kilaža × ponavljanja` svih serija. Za vježbe bez dodatnog opterećenja unesi `0 kg`. Za šipku uključi njenu težinu; kod bučica dosljedno prati jednu ili obje.
