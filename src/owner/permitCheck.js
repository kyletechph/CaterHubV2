// Reads the text in a permit photo (in the browser) and checks it against what the owner typed.
// A photo of a dog, a blank wall or a random page has no matching text, so it fails.
// This is a client-side check: it blocks mistakes and lazy fakes, it cannot prove a permit is genuine.

const KEYWORDS = [
  'permit', 'business', 'registration', 'certificate', 'mayor', 'republic', 'philippines', 'dti', 'sec', 'cda',
  'license', 'licence', 'municipal', 'city', 'barangay', 'trade', 'industry', 'department', 'commission', 'cooperative',
  'securities', 'exchange', 'name', 'owner', 'proprietor', 'issued', 'valid',
];

const digits = (s) => String(s || '').replace(/[^0-9]/g, '');
const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// is `needle` (digits) inside `hay` (digits)? allows one misread digit, because OCR is not perfect
function hasNumber(hay, needle) {
  if (needle.length < 5) return false;
  if (hay.includes(needle)) return true;
  if (needle.length < 7) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let bad = 0;
    for (let j = 0; j < needle.length && bad < 2; j++) if (hay[i + j] !== needle[j]) bad++;
    if (bad < 2) return true;
  }
  return false;
}

export function matchPermit(text, { legalName, registrationNo, permitNo }) {
  const low = String(text || '').toLowerCase();
  const flat = alnum(low);
  const textDigits = digits(low);
  const words = low.split(/[^a-z]+/);
  const hits = KEYWORDS.filter((k) => words.includes(k) || (k.length >= 5 && flat.includes(k)));
  const nameWords = String(legalName || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const nameHit = nameWords.length > 0 && nameWords.filter((w) => flat.includes(w)).length / nameWords.length >= 0.5;
  const regHit = hasNumber(textDigits, digits(registrationNo));
  const permitHit = hasNumber(textDigits, digits(permitNo));
  const problems = [];
  if (hits.length < 2) problems.push('This does not look like a permit or registration certificate.');
  if (!nameHit) problems.push('We could not read your registered business name on the document.');
  if (!regHit && !permitHit) problems.push('We could not find your registration or permit number on the document.');
  return { ok: problems.length === 0, problems, found: { words: hits.length, name: nameHit, registration: regHit, permit: permitHit } };
}

// OCR runs in the browser; the language data is downloaded the first time it is used
export async function readText(image, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress && onProgress(m.progress),
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
