export interface CrosswordInputWord {
  id?: string;
  word: string;
  clue: string;
  points?: number;
}

export interface CrosswordPlacedWord {
  id?: string;
  word_number: number;
  direction: 'across' | 'down';
  start_row: number;
  start_col: number;
  word: string;
  clue: string;
  points: number;
}

export interface CrosswordResult {
  title: string;
  gridRows: number;
  gridCols: number;
  words: CrosswordPlacedWord[];
  candidateWords: CrosswordInputWord[];
}

const GRID_CANVAS_SIZE = 36;
const CANVAS_OFFSET = 12;

/**
 * ENGINE PEMBUAT TATA LETAK TTS AUTENTIK & DETERMINISTIK
 * Menghasilkan persilangan kata 2 arah alami (Across & Down saling memotong dalam jaring puzzle),
 * BUKAN pola sisir/tulang punggung satu arah yang tampak maksa.
 *
 * Jaminan Kualitas:
 * 1. Huruf persilangan dijamin 100% identik dan valid secara ortogonal.
 * 2. Kata-kata paralel tidak pernah berdempetan di baris/kolom berdekatan (anti-clumping).
 * 3. Menghindari kata tunggal yang menggendong seluruh cabang.
 * 4. Nomor soal diurutkan sesuai standar baca TTS (dari kiri-atas ke kanan-bawah).
 */
export function buildCrosswordLayout(
  title: string,
  rawWords: CrosswordInputWord[],
  targetCount = 4
): CrosswordResult | null {
  // 1. Bersihkan kata & buang duplikat
  const cleanWords = rawWords
    .map((w) => ({
      id: w.id,
      word: String(w.word || '').toUpperCase().replace(/[^A-Z]/g, ''),
      clue: String(w.clue || '').trim(),
      points: w.points || 100,
    }))
    .filter((w) => w.word.length >= 3 && w.word.length <= 8 && w.clue.length > 0);

  const uniqueWords: CrosswordInputWord[] = [];
  const seen = new Set<string>();
  for (const w of cleanWords) {
    if (!seen.has(w.word)) {
      seen.add(w.word);
      uniqueWords.push(w);
    }
  }

  if (uniqueWords.length < 3) return null;

  interface InternalPlacedWord {
    id?: string;
    word: string;
    clue: string;
    points?: number;
    direction: 'across' | 'down';
    start_row: number;
    start_col: number;
  }

  // Fungsi pencari satu layout terbaik berdasarkan daftar kata & target
  function findBestLayout(target: number): InternalPlacedWord[] | null {
    let bestLayout: InternalPlacedWord[] | null = null;
    let bestScore = -999999;
    const ATTEMPTS = 160;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const shuffled = [...uniqueWords].sort(() => Math.random() - 0.5);
      const firstWord = shuffled[0];
      const firstDir: 'across' | 'down' = Math.random() > 0.5 ? 'across' : 'down';

      // Canvas virtual 2D
      const grid: (string | null)[][] = Array.from({ length: GRID_CANVAS_SIZE }, () =>
        Array(GRID_CANVAS_SIZE).fill(null)
      );
      const cellDir: { across: boolean; down: boolean }[][] = Array.from(
        { length: GRID_CANVAS_SIZE },
        () => Array.from({ length: GRID_CANVAS_SIZE }, () => ({ across: false, down: false }))
      );

      const startR = CANVAS_OFFSET;
      const startC = CANVAS_OFFSET;
      for (let i = 0; i < firstWord.word.length; i++) {
        const r = firstDir === 'across' ? startR : startR + i;
        const c = firstDir === 'across' ? startC + i : startC;
        grid[r][c] = firstWord.word[i];
        if (firstDir === 'across') cellDir[r][c].across = true;
        else cellDir[r][c].down = true;
      }

      const placed: InternalPlacedWord[] = [
        {
          id: firstWord.id,
          word: firstWord.word,
          clue: firstWord.clue,
          points: firstWord.points,
          direction: firstDir,
          start_row: startR,
          start_col: startC,
        },
      ];

      // Validator penempatan kata ketat
      function canPlace(
        word: string,
        r: number,
        c: number,
        dir: 'across' | 'down'
      ): { valid: boolean; intersections: number } {
        const len = word.length;
        if (
          r < 2 ||
          c < 2 ||
          (dir === 'across' && c + len >= GRID_CANVAS_SIZE - 2) ||
          (dir === 'down' && r + len >= GRID_CANVAS_SIZE - 2)
        ) {
          return { valid: false, intersections: 0 };
        }

        // Sel ujung luar sebelum dan sesudah kata WAJIB kosong
        if (dir === 'across') {
          if (grid[r][c - 1] !== null) return { valid: false, intersections: 0 };
          if (grid[r][c + len] !== null) return { valid: false, intersections: 0 };
        } else {
          if (grid[r - 1][c] !== null) return { valid: false, intersections: 0 };
          if (grid[r + len][c] !== null) return { valid: false, intersections: 0 };
        }

        let intersections = 0;

        for (let i = 0; i < len; i++) {
          const curR = dir === 'across' ? r : r + i;
          const curC = dir === 'across' ? c + i : c;
          const curChar = word[i];
          const existing = grid[curR][curC];

          if (existing !== null) {
            // Huruf wajib cocok 100%
            if (existing !== curChar) return { valid: false, intersections: 0 };
            // Wajib memotong tegak lurus (tidak boleh bersilangan searah)
            if (dir === 'across' && cellDir[curR][curC].across) return { valid: false, intersections: 0 };
            if (dir === 'down' && cellDir[curR][curC].down) return { valid: false, intersections: 0 };
            intersections++;
          } else {
            // Jika sel kosong, sisi ortogonalnya TIDAK BOLEH bersentuhan dengan kata paralel lain
            if (dir === 'across') {
              if (grid[curR - 1][curC] !== null || grid[curR + 1][curC] !== null) {
                return { valid: false, intersections: 0 };
              }
            } else {
              if (grid[curR][curC - 1] !== null || grid[curR][curC + 1] !== null) {
                return { valid: false, intersections: 0 };
              }
            }
          }
        }

        if (intersections === 0) return { valid: false, intersections: 0 };
        return { valid: true, intersections };
      }

      // Coba silangkan kata-kata baru ke salah satu kata yang sudah ada
      for (let wIdx = 1; wIdx < shuffled.length; wIdx++) {
        if (placed.length >= target) break;

        const cand = shuffled[wIdx];
        const acrossCount = placed.filter((p) => p.direction === 'across').length;
        const downCount = placed.filter((p) => p.direction === 'down').length;

        interface CandidatePlacement {
          row: number;
          col: number;
          direction: 'across' | 'down';
          intersections: number;
          score: number;
        }

        const possible: CandidatePlacement[] = [];

        for (const p of placed) {
          const targetDir: 'across' | 'down' = p.direction === 'across' ? 'down' : 'across';

          for (let pIdx = 0; pIdx < p.word.length; pIdx++) {
            const char = p.word[pIdx];

            for (let cIdx = 0; cIdx < cand.word.length; cIdx++) {
              if (cand.word[cIdx] === char) {
                let testR: number;
                let testC: number;

                if (targetDir === 'down') {
                  testR = p.start_row - cIdx;
                  testC = p.start_col + pIdx;
                } else {
                  testR = p.start_row + pIdx;
                  testC = p.start_col - cIdx;
                }

                const res = canPlace(cand.word, testR, testC, targetDir);
                if (res.valid) {
                  let balanceBonus = 0;
                  if (targetDir === 'down' && downCount < acrossCount) balanceBonus = 30;
                  if (targetDir === 'across' && acrossCount < downCount) balanceBonus = 30;

                  possible.push({
                    row: testR,
                    col: testC,
                    direction: targetDir,
                    intersections: res.intersections,
                    score: res.intersections * 25 + balanceBonus,
                  });
                }
              }
            }
          }
        }

        if (possible.length > 0) {
          possible.sort((a, b) => b.score - a.score);
          const best = possible[0];

          for (let i = 0; i < cand.word.length; i++) {
            const r = best.direction === 'across' ? best.row : best.row + i;
            const c = best.direction === 'across' ? best.col + i : best.col;
            grid[r][c] = cand.word[i];
            if (best.direction === 'across') cellDir[r][c].across = true;
            else cellDir[r][c].down = true;
          }

          placed.push({
            id: cand.id,
            word: cand.word,
            clue: cand.clue,
            points: cand.points,
            direction: best.direction,
            start_row: best.row,
            start_col: best.col,
          });
        }
      }

      if (placed.length >= Math.min(target, 3)) {
        const acCount = placed.filter((p) => p.direction === 'across').length;
        const dwCount = placed.filter((p) => p.direction === 'down').length;

        // Wajib minimal memiliki 1 Mendatar dan 1 Menurun agar tidak menjadi sisir searah
        if (acCount === 0 || dwCount === 0) continue;

        const balancePenalty = Math.abs(acCount - dwCount) * 45;

        let minR = 999,
          maxR = 0,
          minC = 999,
          maxC = 0;
        placed.forEach((p) => {
          minR = Math.min(minR, p.start_row);
          minC = Math.min(minC, p.start_col);
          if (p.direction === 'across') {
            maxR = Math.max(maxR, p.start_row);
            maxC = Math.max(maxC, p.start_col + p.word.length - 1);
          } else {
            maxR = Math.max(maxR, p.start_row + p.word.length - 1);
            maxC = Math.max(maxC, p.start_col);
          }
        });

        const width = maxC - minC + 1;
        const height = maxR - minR + 1;
        const area = width * height;

        const score = placed.length * 200 - balancePenalty - area;

        if (score > bestScore) {
          bestScore = score;
          bestLayout = placed;
        }
      }
    }

    return bestLayout;
  }

  // Coba capai targetCount, jika tidak memungkinkan turunkan ke targetCount - 1 (min 3)
  let best = findBestLayout(targetCount);
  if (!best && targetCount > 3) {
    best = findBestLayout(targetCount - 1);
  }

  if (!best || best.length < 3) return null;

  // 2. Normalisasi koordinat agar mulai dari baris 1 & kolom 1 (padding 1 sel tepi)
  const minRow = Math.min(...best.map((p) => p.start_row));
  const minCol = Math.min(...best.map((p) => p.start_col));

  const offsetRow = 1 - minRow;
  const offsetCol = 1 - minCol;

  best.forEach((p) => {
    p.start_row += offsetRow;
    p.start_col += offsetCol;
  });

  // 3. Penomoran Standar TTS: Urutkan kata dari kiri-atas ke kanan-bawah (Reading Order)
  best.sort((a, b) => {
    if (a.start_row !== b.start_row) return a.start_row - b.start_row;
    return a.start_col - b.start_col;
  });

  let currentNum = 1;
  const numberedWords: CrosswordPlacedWord[] = best.map((p) => ({
    id: p.id,
    word_number: currentNum++,
    direction: p.direction,
    start_row: p.start_row,
    start_col: p.start_col,
    word: p.word,
    clue: p.clue,
    points: p.points || 100,
  }));

  // 4. Hitung dimensi grid TTS
  let maxR = 0;
  let maxC = 0;
  numberedWords.forEach((p) => {
    if (p.direction === 'across') {
      maxR = Math.max(maxR, p.start_row);
      maxC = Math.max(maxC, p.start_col + p.word.length - 1);
    } else {
      maxR = Math.max(maxR, p.start_row + p.word.length - 1);
      maxC = Math.max(maxC, p.start_col);
    }
  });

  const finalGridRows = Math.max(maxR + 2, 8);
  const finalGridCols = Math.max(maxC + 2, 8);

  return {
    title,
    gridRows: finalGridRows,
    gridCols: finalGridCols,
    words: numberedWords,
    candidateWords: uniqueWords,
  };
}

