import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findSimilarProducts, extractProducts } from './visualSearch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..'); // StyleLens/ (index.html, css/, js/, assets/)

const MAX_UPLOAD_BYTES = 480 * 1024; // stay under SerpApi's 500KB image-upload limit

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static(SITE_ROOT));

/**
 * Shrinks an image (dimensions + JPEG quality) until it fits under SerpApi's
 * 500KB upload limit, since real phone/camera photos usually exceed that.
 */
async function compressForUpload(inputBuffer) {
  let quality = 75;
  let maxSize = 1024;
  let buffer = await sharp(inputBuffer)
    .rotate() // respect EXIF orientation
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();

  while (buffer.byteLength > MAX_UPLOAD_BYTES && (quality > 25 || maxSize > 400)) {
    if (quality > 25) {
      quality -= 15;
    } else {
      maxSize = Math.round(maxSize * 0.75);
    }
    buffer = await sharp(inputBuffer)
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }
  return buffer;
}

app.post('/api/search', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'לא התקבלה תמונה' });
  }

  try {
    const compressed = await compressForUpload(req.file.buffer);
    const raw = await findSimilarProducts(compressed, { type: 'products' });
    const products = extractProducts(raw);
    res.json({ products });
  } catch (err) {
    console.error('search failed:', err);
    res.status(502).json({ error: err.message || 'החיפוש נכשל' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StyleLens server running - open http://localhost:${PORT}`);
});
