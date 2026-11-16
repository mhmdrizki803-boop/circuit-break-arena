# BRIEF — "CIRCUIT BREAK" (game untuk make.fun best-game-01)

Bikin game 2D canvas, TANPA library, semua digambar procedural (gak ada file aset, gak ada network).
Bahasa komentar & nama fungsi: **Inggris**. Nama game: **CIRCUIT BREAK**. Tema: neon arena survival.

## Aturan wajib (dari panitia)
- Static files di `game/`, gak ada build step. `game/index.html` jalan di Chrome, **NOL network request**.
- **Original**: semua ide, art, suara, nama bikinan sendiri. Semua visual digambar pakai canvas API.
- Wajib ada: tujuan, aturan, kontrol responsif, cara menang/kalah/skor, **start DAN restart**, HUD.
- Suara: **WebAudio procedural** (oscillator/noise), bukan file.

## Gameplay
Pemain = pulsa cahaya di arena. Musuh = bentuk geometris yang menyerbu dari tepi.
- **Kontrol**: WASD/panah = gerak · mouse = arah bidik · klik kiri ATAU spasi = tembak · P/Esc = pause · R = restart.
- **Tujuan**: bertahan selama mungkin, skor setinggi mungkin. Nyawa 3.
- **Musuh** (4 jenis, beda perilaku + warna + bentuk):
  1. `drone` — segitiga, ngejar lambat, mudah.
  2. `runner` — belah ketupat, cepat, zig-zag.
  3. `tank` — kotak besar, lambat, HP 3, pecah jadi 2 drone saat mati.
  4. `spinner` — bintang, nembak proyektil ke arah pemain.
- **Wave**: tiap wave makin banyak & cepat. Tampilkan "WAVE n" di tengah saat mulai.
- **Skor**: musuh 10-50 poin, **combo multiplier** naik kalau nembak dalam 2 detik (maks x8).
- **Powerup** (jatuh dari musuh, diambil dengan menyentuh): `shield` (kebal 5 detik), `rapid` (tembak 2x cepat 8 detik), `heal` (+1 nyawa, maks 3).
- **Damage**: kena musuh = -1 nyawa, kebal 1,5 detik (kedip), layar bergetar.
- **Game over** saat nyawa 0 → tampilkan skor akhir + rekor tertinggi (localStorage) + "PRESS R TO RESTART".

## Visual (INI YANG DINILAI — harus menang di screenshot)
- Latar: hitam pekat `#05060a` + grid neon tipis + vignette.
- Palet neon: cyan `#22e6ff`, magenta `#ff3ea5`, kuning `#ffd23f`, hijau `#4dff9e`, ungu `#a06bff`.
- Semua benda digambar **glow** (`shadowBlur` + `shadowColor`), plus inti putih terang.
- Partikel saat musuh mati (ledakan 20-30 partikel), jejak ekor peluru.
- Screen shake saat kena damage. Ledakan cincin (ring) saat musuh mati besar.
- Pemain: bentuk inti + ring berputar + aura.

## Layar (WAJIB, karena juri cari ini di screenshot)
1. **TITLE** — nama "CIRCUIT BREAK" besar dengan glow, subtitle, "PRESS ENTER TO START",
   daftar kontrol, kredit. Animasi: musuh contoh lewat, partikel.
2. **PLAY** — gameplay + HUD: skor kiri-atas, wave kanan-atas, nyawa (ikon) kiri-bawah,
   bar combo, indikator powerup.
3. **OVER** — "SYSTEM BREACH" besar, skor akhir, rekor, statistik (wave, musuh dibunuh),
   "PRESS R TO RESTART".
4. **PAUSE** — overlay "PAUSED".

## Screenshot mode (WAJIB — dipakai buat bikin screenshot)
`game/index.html?shot=title|play|over&seed=<n>` harus langsung nampilin layar itu
secara **deterministik** (seed sama = frame sama, tanpa input pemain, autopilot sederhana
yang jalanin aturan asli beberapa detik dulu).
- `?shot=title` → layar judul.
- `?shot=play&seed=1` → pertengahan game, HUD penuh, banyak musuh & partikel, skor tinggi.
- `?shot=over&seed=1` → layar game over dengan skor akhir.
Saat `shot` ada: gak ada input, gak ada audio, tetap render animasi.

## Struktur file (JANGAN digabung — juri menilai struktur dari nama file & fungsi)
```
game/index.html
game/src/main.js       — boot, game loop, state machine (TITLE/PLAY/PAUSE/OVER)
game/src/config.js     — semua angka tuning + palet warna
game/src/input.js      — keyboard + mouse
game/src/world.js      — simulasi: spawn, gerak, tabrakan, wave, skor, powerup
game/src/render.js     — semua gambar latar/entitas/HUD
game/src/hud.js        — layar TITLE/OVER/PAUSE + elemen HUD
game/src/particles.js  — sistem partikel + screen shake
game/src/audio.js      — WebAudio procedural (tembak, ledakan, kena, powerup, wave)
game/src/random.js     — RNG ber-seed (deterministik untuk shot mode)
game/src/shots.js      — scene deterministik untuk ?shot=
```
Tulis juga root `main.ts` (Node 22+, standard library): copy `game/` dan `screenshots/`
dari folder ini ke `MAKEFUN_OUTPUT_DIR` (default `/output`), lalu tulis `dossier.json`
pakai `buildDossier` dari `./vendor/makefun-game.ts` — sama seperti versi starter, tapi ditulis sendiri.

## Mutu kode (juri menilai dari nama fungsi/kelas di outline)
- Nama file & fungsi deskriptif: `spawnWave`, `resolvePlayerEnemyCollision`, `drawGlowRing`, dst.
- Satu file = satu tanggung jawab. Fungsi pendek, komentar singkat Inggris.
- Gak boleh ada kode mati, gak boleh `TODO`.

## Cara kerjanya
Kerjakan SAMPAI SELESAI: tulis semua file di atas. Lalu tes dengan
`node serve.ts` (port 8080) dan pastikan `game/index.html?shot=title` gak error.
Jangan tanya balik — langsung implementasi penuh.
