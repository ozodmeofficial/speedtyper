# SpeedTyper

**SpeedTyper** ([speedtyper.uz](https://speedtyper.uz)) — minimalistik, chalg‘ituvchi narsalarsiz yozish tezligi testi va 200 kishigacha bo‘lgan jonli poygalar.

- Bosh sahifa — bu test: sahifa ochilishi bilan kursor tayyor, yozishni boshlang.
- Rejimlar: **vaqt** (15/30/60/120), **so‘zlar** (10/25/50/100), **iqtibos**, **zen**, **maxsus matn**; tinish belgilari va raqamlar.
- Tillar: English (200 / 1k), O‘zbekcha (lotin, `o‘ g‘` va tutuq belgisi to‘g‘ri), Русский. Klaviaturadagi `'` avtomatik `‘`/`’` sifatida qabul qilinadi.
- Natija ekrani: wpm, aniqlik, xom tezlik, belgilar (to‘g‘ri/noto‘g‘ri/ortiqcha/tushib qolgan), barqarorlik, soniyama-soniya grafik va xatolar, shaxsiy rekord, xato so‘zlarni mashq qilish, rasmga olish.
- 30 ta mavzu (yorug‘ va qorong‘i), shaxsiy mavzu muharriri, 10 ta shrift, kursor uslublari, silliq kursor, lenta rejimi, ko‘r/erkin/ishonch rejimlari, minimal tezlik/aniqlik, bosish ovozlari.
- Buyruqlar paneli: `esc` yoki `ctrl+shift+p` — barcha sozlamalar, mavzular, shriftlar bo‘yicha qidiruv.
- Hisoblar (login + parol, argon2id), profil (`/u/<nom>`): rekordlar, faollik xaritasi, tezlik tarixi, natijalar, poygalar.
- Reyting: vaqt 15 / vaqt 60 × english / o‘zbekcha / русский, barcha vaqt va kunlik (Toshkent vaqti), poyga reytingi.
- Poygalar (`/race`): tezkor poyga, ochiq/yopiq xona, taklif havolasi, kod bo‘yicha qo‘shilish, 3‑2‑1 sanoq, jonli progress, 1/2/3 o‘rin medallari, tomosha rejimi, qayta ulanish.
- Interfeys tillari: O‘zbekcha (standart), English, Русский.

## Texnologiyalar

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL 17 · Prisma 6 · `ws` · Vitest.
Bitta Node jarayoni: `server.ts` Next.js so‘rovlarini va `/ws` WebSocket endpointini **bitta portda** xizmat qiladi.

```
server.ts                  custom server (HTTP + /ws), esbuild bilan dist/server.cjs ga yig‘iladi
src/app/                   sahifalar va API (auth, results, settings, leaderboard, health)
src/components/test/       yozish testi: TypingSurface (so‘zlar, kursor, input), natija, grafik
src/components/race/       poyga lobbisi va xona UI, useRace (WebSocket hook)
src/lib/typing/            engine (holat mashinasi), stats (wpm/raw/acc/consistency), so‘z generatori
src/lib/anticheat.ts       natijalarni serverda qayta hisoblash va tekshirish
src/lib/race/protocol.ts   poyga protokoli (ixcham JSON)
src/server/race/           Room (holat mashinasi), RaceManager, ws adapter, DB ga saqlash
src/server/auth/           sessiyalar (DB, HMAC token, rotatsiya), argon2id, CSRF
src/data/                  so‘z ro‘yxatlari va iqtiboslar (JSON)
prisma/                    sxema va migratsiyalar
scripts/race-load.ts       200 o‘yinchili poyga yuklama testi
tests/                     unit testlar (stats, anticheat, poyga xonasi)
```

## Lokal ishga tushirish

```bash
cp .env.example .env            # DATABASE_URL, SESSION_SECRET ni to‘ldiring
npm ci
npx prisma migrate deploy
npm run dev                     # http://localhost:3000
```

Production rejimi:

```bash
npm run build && npm start
```

## Tekshiruvlar

```bash
npm run typecheck
npm run lint
npm test
RACE_LOADTEST=1 npm start &     # boshqa terminalda:
URL=ws://localhost:3000/ws npm run load:race            # 1 xona × 200 o‘yinchi
ROOMS=5 URL=ws://localhost:3000/ws npm run load:race    # 5 xona × 200 o‘yinchi
```

## Hisoblash usuli

- **wpm** = (to‘liq to‘g‘ri yozilgan so‘zlardagi belgilar + ulardan keyingi bo‘shliqlar) / 5 / daqiqa
- **xom (raw)** = (barcha yozilgan belgilar: to‘g‘ri + noto‘g‘ri + ortiqcha + bo‘shliqlar) / 5 / daqiqa
- **aniqlik** = to‘g‘ri bosilgan tugmalar / barcha bosilgan tugmalar
- **barqarorlik** = `100 × (1 − tanh(cv + cv³/3 + cv⁵/5))`, bu yerda `cv` — soniyalik xom tezlikning variatsiya koeffitsiyenti

## Poygalar qanday masshtablanadi

- Mijoz progressni har 250 ms da yuboradi (`c` to‘g‘ri belgilar, `w` so‘z indeksi, `e` xatolar).
- Server progressni tekshiradi (monotonlik, maksimal ~350 wpm tezlik, matn uzunligi), wpm ni **o‘zi** hisoblaydi.
- Har bir xona uchun holat sekundiga 5 marta **bitta** xabar sifatida yig‘iladi (faqat o‘zgargan o‘yinchilar, har 2 soniyada to‘liq kadr) va bir marta serializatsiya qilinib barcha ulanishlarga yuboriladi.
- Sekin mijozlar (bufer > 512 KB) oraliq kadrlarni o‘tkazib yuboradi, bufer > 4 MB bo‘lsa ulanish yopiladi.
- Heartbeat (ping/pong), xabar hajmi limiti (4 KB), ulanish bo‘yicha rate limit (20 msg/s), IP bo‘yicha ulanishlar limiti, Origin tekshiruvi.

Deploy bo‘yicha: [docs/DEPLOY.md](docs/DEPLOY.md).
