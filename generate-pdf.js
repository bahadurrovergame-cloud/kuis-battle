const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generateManual() {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Capture Dashboard Hub
  console.log('Capturing Dashboard Hub...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '1_dashboard_hub.png') });

  // 2. Capture Layar Proyektor
  console.log('Capturing Layar Proyektor...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/operator', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '2_proyektor.png') });

  // 3. Capture Kontrol Operator
  console.log('Capturing Kontrol Operator...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/control', { waitUntil: 'networkidle0', timeout: 30000 });
  // Set auth session if needed
  await page.evaluate(() => {
    sessionStorage.setItem('auth_role', 'operator');
  });
  await page.goto('http://localhost:3000/control', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '3_kontrol_operator.png') });

  // 4. Capture Admin Bank Soal & Regu
  console.log('Capturing Admin Bank Soal...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => {
    sessionStorage.setItem('auth_role', 'admin');
  });
  await page.goto('http://localhost:3000/admin/soal', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '4_admin_soal.png') });

  // 5. Capture Meja Peserta (Mobile Viewport)
  console.log('Capturing Meja Peserta Mobile...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:3000/peserta', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '5_peserta_join.png') });

  // Simulate joined team
  await page.evaluate(() => {
    localStorage.setItem('peserta_room', 'KUIS88');
  });
  await page.screenshot({ path: path.join(screenshotsDir, '6_peserta_scoreboard.png') });

  console.log('Screenshots captured successfully!');

  // Helper encode base64
  const toBase64 = (file) => {
    const data = fs.readFileSync(path.join(screenshotsDir, file));
    return `data:image/png;base64,${data.toString('base64')}`;
  };

  const img1 = toBase64('1_dashboard_hub.png');
  const img2 = toBase64('2_proyektor.png');
  const img3 = toBase64('3_kontrol_operator.png');
  const img4 = toBase64('4_admin_soal.png');
  const img5 = toBase64('5_peserta_join.png');

  // Build HTML Document for PDF
  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Panduan & Mockup Kuis Battle Panggung</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      font-size: 11pt;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .page-break {
      page-break-before: always;
    }
    .header-banner {
      background: linear-gradient(135deg, #0f172a, #1e3a8a);
      color: #ffffff;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 24px;
      text-align: center;
    }
    .header-banner h1 {
      margin: 0 0 6px 0;
      font-size: 22pt;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header-banner p {
      margin: 0;
      font-size: 11pt;
      color: #93c5fd;
    }
    .meta-tag {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 9pt;
      font-weight: bold;
      margin-top: 10px;
    }
    h2 {
      color: #0f172a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 6px;
      margin-top: 24px;
      font-size: 15pt;
    }
    h3 {
      color: #1e40af;
      margin-top: 14px;
      margin-bottom: 6px;
      font-size: 12pt;
    }
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 16px;
    }
    .spec-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 10pt;
    }
    .spec-table th, .spec-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
    }
    .spec-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: bold;
    }
    .img-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      margin: 12px 0 16px 0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      background: #000;
      text-align: center;
    }
    .img-box img {
      width: 100%;
      max-height: 380px;
      object-fit: contain;
      display: block;
    }
    .mobile-img-box {
      max-width: 260px;
      margin: 12px auto;
      border: 2px solid #334155;
      border-radius: 14px;
      overflow: hidden;
    }
    .mobile-img-box img {
      width: 100%;
      display: block;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 9pt;
      font-weight: bold;
      background: #e2e8f0;
    }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .footer {
      text-align: center;
      font-size: 9pt;
      color: #64748b;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
    }
  </style>
</head>
<body>

  <!-- HALAMAN 1 -->
  <div class="header-banner">
    <h1>Kuis Battle Panggung</h1>
    <p>Buku Panduan, Spesifikasi Sistem & Mockup Visual Aplikasi Realtime</p>
    <div class="meta-tag">Platform: Next.js 15 + Supabase Realtime &bull; Arsitektur 1 Operator</div>
  </div>

  <h2>1. Ringkasan Eksekutif & Konsep Lomba</h2>
  <div class="card">
    <p><strong>Kuis Battle Panggung</strong> dirancang khusus untuk perlombaan Cerdas Cermat / Cepat-Tepat tatap muka di atas panggung dengan <strong>1 orang operator teknis</strong>. Peserta berdiskusi langsung di meja dan menjawab secara lisan di mikrofon panggung, sedangkan smartphone peserta murni berfungsi sebagai <em>Personal Live Scoreboard</em> pasif.</p>
  </div>

  <h2>2. Standar Minimal Perangkat (Minimum Hardware Specs)</h2>
  <table class="spec-table">
    <thead>
      <tr>
        <th>Peran Layar</th>
        <th>Perangkat Minimal</th>
        <th>Spesifikasi & Syarat Browser</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Layar Proyektor</strong></td>
        <td>1 Laptop / PC Panggung</td>
        <td>Resolusi Full HD (1080p), Terhubung HDMI ke Proyektor/TV panggung, Speaker Aktif, Browser Chrome / Edge.</td>
      </tr>
      <tr>
        <td><strong>Kontrol Operator</strong></td>
        <td>1 Laptop Operator</td>
        <td>Laptop dengan keyboard fisik (untuk tombol shortcut [SPACEBAR]), Browser Chrome / Edge / Safari.</td>
      </tr>
      <tr>
        <td><strong>Scoreboard Meja</strong></td>
        <td>1 HP per Regu</td>
        <td>Smartphone Android / iOS (Chrome / Safari), Mendukung Web Screen Wake Lock & Fullscreen.</td>
      </tr>
      <tr>
        <td><strong>Konektivitas</strong></td>
        <td>Wi-Fi Lokal / Seluler</td>
        <td>Koneksi internet stabil untuk WebSocket Supabase (kuota 4G/5G atau Wi-Fi panggung).</td>
      </tr>
    </tbody>
  </table>

  <h2>3. Layar 1: Dashboard Admin Pusat (Hub Navigasi)</h2>
  <p>Pintu gerbang utama saat membuka web. Menyediakan 3 QR Code khusus untuk proyektor, operator, dan HP peserta tanpa perlu mengetik URL manual.</p>
  <div class="img-box">
    <img src="${img1}" alt="Dashboard Admin Hub" />
  </div>

  <div class="page-break"></div>

  <!-- HALAMAN 2 -->
  <h2>4. Layar 2: Tampilan Proyektor Panggung (/operator)</h2>
  <p>Layar utama yang menghadap ke penonton dan peserta di panggung lomba.</p>
  <div class="img-box">
    <img src="${img2}" alt="Layar Proyektor" />
  </div>
  <div class="card">
    <h3>Fungsi & Fitur Utama Layar Proyektor:</h3>
    <ul>
      <li><strong>Countdown Timer Lingkaran Dinamis</strong>: Berubah warna Hijau &rarr; Kuning &rarr; Merah Berkedip di 5 detik kritis.</li>
      <li><strong>Audio SFX Synthesizer</strong>: Detak jam setiap detik, nada pembukaan kunci jawaban, dan buzzer waktu habis tanpa perlu file audio eksternal.</li>
      <li><strong>Render 3 Tipe Soal</strong>: Mendukung Pilihan Ganda (Grid A-D), Benar/Salah, dan Essay rujukan juri.</li>
      <li><strong>Live Leaderboard Samping</strong>: Klasemen skor real-time dengan medali Emas 🥇, Perak 🥈, Perunggu 🥉.</li>
      <li><strong>Podium Kemenangan (Victory Screen)</strong>: Muncul otomatis saat laga usai lengkap dengan fanfare audio & kembang api <em>Canvas-Confetti</em>.</li>
    </ul>
  </div>

  <h2>5. Layar 3: Dasbor Kendali 1 Operator (/control)</h2>
  <p>Pusat kendali operator teknis untuk mengendalikan jalannya perlombaan di panggung.</p>
  <div class="img-box">
    <img src="${img3}" alt="Kontrol Operator" />
  </div>
  <div class="card">
    <h3>Fungsi & Tombol Kontrol:</h3>
    <ul>
      <li><span class="badge badge-blue">[SPACEBAR] Shortcut</span>: Tekan spasi keyboard untuk Pause / Resume timer seketika saat peserta berbicara di mikrofon tanpa me-reset sisa waktu!</li>
      <li><span class="badge badge-green">[+100] [+50]</span>: Tombol tambah skor instan + Efek nada Arpeggio semarak.</li>
      <li><span class="badge badge-amber">[-50] [-100]</span>: Tombol pengurangan skor (skor bisa bernilai negatif) + Nada turun dramatis.</li>
      <li><strong>Kolom Custom & Tombol Terapkan</strong>: Input kustom angka dengan indikator visual animasi "✓ Tersimpan!".</li>
      <li><strong>Buka Kunci Jawaban & Soal Selanjutnya</strong>: Mengendalikan perpindahan soal panggung dalam 1 klik.</li>
    </ul>
  </div>

  <div class="page-break"></div>

  <!-- HALAMAN 3 -->
  <h2>6. Layar 4: Bank Soal & Manajemen Peserta (/admin/soal)</h2>
  <p>Panel admin untuk persiapan konten soal sebelum acara dimulai serta pengaturan data regu.</p>
  <div class="img-box">
    <img src="${img4}" alt="Bank Soal dan Peserta" />
  </div>
  <div class="card">
    <h3>Fasilitas Panel Admin:</h3>
    <ul>
      <li><strong>Tab Bank Soal</strong>: CRUD soal lengkap (Pilihan Ganda, Benar/Salah, Essay), atur durasi timer per soal, filter kategori.</li>
      <li><strong>Quick Import & Export JSON</strong>: Backup dan upload puluhan soal sekaligus dari format file JSON.</li>
      <li><strong>Tab Manajemen Regu & Peserta</strong>: Edit nama grup, ganti warna meja panggung, isi jumlah dan nama anggota peserta (misal: "Budi (Ketua), Siti, Ahmad").</li>
    </ul>
  </div>

  <h2>7. Layar 5: Meja Smartphone Peserta (/peserta)</h2>
  <div style="display: flex; gap: 20px; align-items: center;">
    <div style="flex: 1;">
      <p>Layar yang diletakkan di atas meja masing-masing regu di panggung lomba:</p>
      <div class="card">
        <h3>Fitur Khusus Smartphone Peserta:</h3>
        <ul>
          <li><strong>Screen Wake Lock API</strong>: Layar HP otomatis <strong>tetap menyala terus (tidak akan sleep/mati)</strong> selama lomba berlangsung.</li>
          <li><strong>Tombol Layar Penuh (Fullscreen)</strong>: Menyembunyikan address bar browser agar tampilan bersih seperti papan skor digital panggung.</li>
          <li><strong>Skor Raksasa & Rank Live</strong>: Angka skor ekstra besar sesuai warna tim.</li>
          <li><strong>Animasi Kilatan Layar</strong>: Layar berkedip Hijau saat poin bertambah, atau Merah saat poin berkurang.</li>
          <li><strong>SOP Handphone Lomba</strong>: Cukup aktifkan mode <em>Jangan Ganggu (Do Not Disturb)</em> di HP peserta agar bebas dari gangguan notifikasi WA/telepon.</li>
        </ul>
      </div>
    </div>
    <div style="width: 250px; flex-shrink: 0;">
      <div class="mobile-img-box">
        <img src="${img5}" alt="Layar HP Peserta" />
      </div>
    </div>
  </div>

  <div class="footer">
    Dokumentasi & Panduan Resmi Aplikasi Kuis Battle Panggung &bull; Digenerate Otomatis untuk Tim Pelaksana Lomba
  </div>

</body>
</html>
  `;

  const docPath = path.join(__dirname, 'manual_temp.html');
  fs.writeFileSync(docPath, htmlContent, 'utf-8');

  console.log('Generating PDF document...');
  const pdfPage = await browser.newPage();
  await pdfPage.goto(`file://${docPath}`, { waitUntil: 'networkidle0' });

  const pdfOutputPath = path.join('C:\\Users\\HP\\Documents\\kuis-battle', 'Panduan_Mockup_Kuis_Battle_Panggung.pdf');
  await pdfPage.pdf({
    path: pdfOutputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '12mm',
      bottom: '12mm',
      left: '12mm',
      right: '12mm'
    }
  });

  console.log('PDF successfully generated at:', pdfOutputPath);
  await browser.close();
}

generateManual().catch(console.error);
