import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getJson } from 'serpapi';

const API_KEY = process.env.SERPAPI_KEY;
const UPLOAD_ENDPOINT = 'https://serpapi.com/image';
const MAX_UPLOAD_BYTES = 500 * 1024; // SerpApi's image-upload endpoint hard limit

function assertKeyConfigured() {
  if (!API_KEY) {
    throw new Error(
      'Missing SERPAPI_KEY. Copy server/.env.example to server/.env and set your key from https://serpapi.com/manage-api-key'
    );
  }
}

/**
 * Uploads raw image bytes to SerpApi and returns the image_id Google Lens needs.
 * (google_lens itself only accepts a public image URL or this image_id - not a raw upload.)
 */
async function uploadImage(imageBuffer) {
  if (imageBuffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Image is ${(imageBuffer.byteLength / 1024).toFixed(0)}KB, but SerpApi's upload endpoint accepts at most 500KB - resize/compress the image before calling this function.`
    );
  }

  const form = new FormData();
  form.append('image', new Blob([imageBuffer]), 'query-image.jpg');
  form.append('api_key', API_KEY);

  const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok || !json.image_id) {
    throw new Error(`SerpApi image upload failed: ${json.error || res.statusText}`);
  }
  return json.image_id;
}

/**
 * Finds identical/similar products for a clothing photo using SerpApi's Google Lens engine.
 *
 * @param {Buffer|string} image - raw image Buffer, a local file path, or a public http(s) image URL
 * @param {object} [options]
 * @param {'all'|'products'|'exact_matches'|'visual_matches'|'about_this_image'} [options.type='products']
 * @param {string} [options.hl] - language code, e.g. 'iw' (Hebrew), 'en'
 * @param {string} [options.country] - two-letter country code, e.g. 'il'
 * @returns {Promise<object>} the raw SerpApi JSON response
 */
export async function findSimilarProducts(image, options = {}) {
  assertKeyConfigured();
  const { type = 'products', hl, country } = options;

  let imageParam;
  if (typeof image === 'string' && /^https?:\/\//i.test(image)) {
    imageParam = { url: image };
  } else {
    const buffer = Buffer.isBuffer(image) ? image : await readFile(image);
    const image_id = await uploadImage(buffer);
    imageParam = { image_id };
  }

  return getJson({
    engine: 'google_lens',
    api_key: API_KEY,
    type,
    ...(hl ? { hl } : {}),
    ...(country ? { country } : {}),
    ...imageParam,
  });
}

/**
 * Normalizes a raw google_lens response into a simple list of
 * { title, link, source, thumbnail, price }, regardless of which
 * result array the requested `type` produced.
 */
export function extractProducts(serpApiResponse) {
  const list =
    serpApiResponse.visual_matches ||
    serpApiResponse.products ||
    serpApiResponse.shopping_results ||
    [];

  return list.map((item) => ({
    title: item.title,
    link: item.link,
    source: item.source,
    thumbnail: item.thumbnail,
    // SerpApi returns price as { value, extracted_value, currency } - split into a display
    // string and a plain number so the frontend can sort without re-parsing currency strings.
    price: item.price?.value ?? (typeof item.extracted_price === 'number' ? String(item.extracted_price) : null),
    priceValue: item.price?.extracted_value ?? (typeof item.extracted_price === 'number' ? item.extracted_price : null),
  }));
}

// CLI usage: node visualSearch.js <path-to-image-or-url>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node visualSearch.js <path-to-image-or-url>');
    process.exit(1);
  }
  findSimilarProducts(input)
    .then((result) => console.log(JSON.stringify(extractProducts(result), null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
