# Prófunaskýrsla vegna afhendingar — 3. nóvember 2026

Fylgiskjal við [íslensku afhendingarskýrsluna](YFIRFERD-IS.md). Niðurstöðurnar hér voru keyrðar sérstaklega við undirbúning GitHub-afhendingar. Þær lýsa staðbundnum kóðaathugunum, ekki almennu útgáfusamþykki.

## Umhverfi og afmörkun

- Windows, Node.js **24.16.0**, npm **11.13.0**.
- Notuð var fyrirliggjandi `node_modules`-uppsetning. Nýtt `npm ci` úr hreinu klóni var **ekki** keyrt.
- Verkefnið sjálft tilgreinir npm **11.19.1**. Það er rétt útgáfa fyrir enduruppsetningu og CI; frávikið hér er skráð svo ekki sé fullyrt að hreint klón hafi verið sannreynt.
- Síðasta fyrirliggjandi GitHub-commit, `b52efc79e989dcdaa4b556591a5c0924009534f7`, var varðveitt með fast-forward áður en nýja afhendingin var vistuð. Prófin náðu yfir nýja Hittumst-vinnukóðann sem fylgir afhendingunni, ekki eingöngu þann eldri commit.
- Engar lagfæringar á hegðun forritsins voru gerðar við þessa afhendingu. Skjöl, README, útilokun Study Atlas og endurheimt öruggra umhverfissniðmáta voru afhendingarbreytingarnar.
- Fullt commit-auðkenni afhendingarinnar fæst með `git rev-parse HEAD` eftir klón á þessari útgáfu. Síðari breytingar krefjast nýrrar sannprófunar.

## Ferskar niðurstöður

| Athugun | Niðurstaða |
| --- | --- |
| `npm run typecheck` | Stóðst fyrir admin, mobile og shared. |
| `npm test` | **1.026 próf stóðust, 2 sleppt.** |
| Admin-hluti einingaprófa | 287 stóðust, 2 sleppt; 48 prófunarskrár stóðust og 1 sleppt. |
| Mobile-hluti einingaprófa | 612 stóðust í 80 skrám. |
| Shared-hluti einingaprófa | 127 stóðust í 15 skrám. |
| `npm run test:release` | 61 próf stóðst. |
| `npm run test:dependencies` | 6 próf stóðust. |
| `npm run lint` | Stóðst, engar viðvaranir. |
| `npm run build` | Next.js-framleiðslubygging stóðst. Þetta er ekki native-bygging farsímaappsins. |
| Mobile web export | Stóðst; 2.450 modules, niðurstaða í útilokaðri `apps/mobile/dist-review`. |
| Figma-hjálparskriptur | 12 próf stóðust í `design/figma-sjodur/extract-source.test.mjs` og `source-export.test.mjs`. |
| `git diff --check` | Engar whitespace-villur í breytingunum við athugun. |
| Afhendingarskrár | Leitað að algengum einkalykla-, token-, lykil- og gagnagrunnstengistrengjasniðum; engin samsvörun fannst. Þetta er afmörkuð leit, ekki heildaröryggisúttekt. |

Heildin er 1.105 próf sem stóðust: 1.026 workspace-próf + 61 útgáfupróf + 6 dependency-próf + 12 hönnunarskriftupróf. Týpupróf, lint og byggingar eru auk þess.

### Tvö miðlapróf voru sleppt

`apps/admin/src/lib/jobs/media.integration.test.ts` þarf `FFMPEG_PATH` og `FFPROBE_PATH`. Þau skilyrði voru ekki uppfyllt og tvö raunveruleg miðlasamþættingarpróf keyrðust því ekki. Önnur miðlaeiningapróf jafngilda ekki staðfestingu á raunverulegri FFmpeg-vinnslu. CI setur upp FFmpeg sérstaklega.

### Stillingar bygginga

Mobile-web-export keyrði með `EXPO_NO_DOTENV=1`, development-umhverfi, tómum opinberum Supabase-stillingum og auth-bypass false. Það var því **sýnihamssmíði**, ekki staðfesting á tengdum bakenda.

Admin-byggingin las fyrirliggjandi staðbundna `.env.local`. Innihald hennar fylgir ekki GitHub. Vel heppnuð bygging sannar ekki að samsvarandi umhverfi eða þjónustur séu í lagi hjá nýjum aðila.

Eldri eiginleikalisti nefnir fyrri mobile-villu vegna NUL-stafs í `EntryEditor.tsx`. Núverandi mobile-týpupróf og web-export stóðust; ekki á að meðhöndla eldri villulýsingu sem staðfesta núverandi smíðahindrun.

## Það sem var ekki keyrt eða sannreynt

- Hrein uppsetning úr nýju klóni, núverandi dependency-audit gegn þjónustu eða ferskt vulnerability-mat.
- SQL-/RLS-prófasafnið, hreinn grunnur, varðveitt uppfærsla og endurheimt gagnagrunns.
- Raunveruleg Auth/Storage/Realtime-þjónustupróf eða hýstar migrations.
- Edge Function-typecheck/runtime, Docker-runtime eða nýjar hýstar innviðaprófanir.
- Native Android/iOS-smíði, undirritaður útgáfukandídat eða próf á líkamlegum tækjum.
- Raunverulegt push, hljóð, miðlamoderation, verslanakaup, greiðslur eða eyðing hjá ytri þjónustuaðilum.
- Álags-, öryggis-, vöktunar- og heildarendurheimtaræfingar í staging/production.
- Verslanasending, rekstrarsamþykki eða lagalegt samþykki.

Þessi verkefni eru því áfram óstaðfest í þessari afhendingu. Eldri niðurstöður í öðrum skjölum gilda aðeins fyrir dagsetta útgáfu/umhverfi sem þau lýsa.

## Hvernig á að endurtaka athuganir?

Úr rót nýs klóns, með réttum Node/npm-útgáfum:

```powershell
npx --yes npm@11.19.1 ci
npm run check
npm run build
```

Framleiðslubygging admin krefst gildra tengistillinga; sjá [uppsetningarleiðina og localhost-takmörkun](YFIRFERD-IS.md#6-hvernig-á-að-keyra-verkefnið). Ekki afrita leynilykla eiganda. Nota eigið aðskilið prófunarumhverfi.

Til að endurtaka nákvæmlega sýnihamsexportið á PowerShell, í eigin nýjum glugga:

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_APP_ENV = 'development'
$env:EXPO_PUBLIC_SUPABASE_URL = ''
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = ''
$env:EXPO_PUBLIC_DEV_BYPASS_AUTH = 'false'
npm run build:web --workspace @rummal/mobile -- --output-dir dist-review
```

Sérstök hönnunarskriftupróf:

```powershell
node --test design/figma-sjodur/extract-source.test.mjs design/figma-sjodur/source-export.test.mjs
```

Hráar keyrsluskrár voru vistaðar staðbundið í útilokuðu `tmp/review-*.log`. Þær eru ekki fylgiskjöl í opinbera repóinu. Skýrslan hér varðveitir niðurstöður og takmarkanir án staðbundinna tengistillinga eða hrárrar villuskráningar. Skoða þarf GitHub Actions sérstaklega fyrir stöðu prófana á GitHub eftir push; staðbundnar niðurstöður hér eru ekki fullyrðing um grænt CI.
