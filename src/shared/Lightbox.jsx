import { useCallback, useEffect, useState } from 'react';

// Click any caterer / package / gallery photo to see it large in a pop-up.
// One document-level listener, so every current and future photo with these selectors works without extra code.
const SEL = [
  '.ph img', // cards, package cards, compare, saved
  '.pic img', // package detail
  '.cc-clip img:not(.blur)', // directory cards
  '.tile img.tile-fg', // caterer profile cover tiles
  '.gal img:not(.tile-bg)', // gallery page
  '.rev-ph img', // customer review photos
  '.photo-card img', // owner photo manager
].join(',');

const eligible = () => {
  const seen = new Set();
  return [...document.querySelectorAll(SEL)].filter((i) => {
    const s = i.currentSrc || i.src;
    if (!s || seen.has(s) || !i.naturalWidth) return false;
    seen.add(s);
    return true;
  });
};

export default function Lightbox() {
  const [view, setView] = useState(null); // { list: [{src, alt}], i }

  useEffect(() => {
    const click = (e) => {
      const img = e.target.closest && e.target.closest('img');
      if (!img || !img.matches(SEL) || !img.naturalWidth) return;
      e.preventDefault();
      e.stopPropagation(); // image sits inside a link on some cards; open the photo instead of navigating
      const imgs = eligible();
      const src = img.currentSrc || img.src;
      const list = imgs.map((x) => ({ src: x.currentSrc || x.src, alt: x.alt || '' }));
      const i = Math.max(0, list.findIndex((x) => x.src === src));
      setView({ list: list.length ? list : [{ src, alt: img.alt || '' }], i });
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, []);

  const close = useCallback(() => setView(null), []);
  const go = useCallback((d) => setView((v) => v && { ...v, i: (v.i + d + v.list.length) % v.list.length }), []);

  useEffect(() => {
    if (!view) return;
    const key = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
    };
  }, [view, close, go]);

  if (!view) return null;
  const cur = view.list[view.i],
    many = view.list.length > 1;
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={close}>
      <button type="button" className="lb-x" aria-label="Close photo" onClick={close}>
        ×
      </button>
      {many && (
        <button type="button" className="lb-nav prev" aria-label="Previous photo" onClick={(e) => (e.stopPropagation(), go(-1))}>
          ‹
        </button>
      )}
      <img className="lb-img" src={cur.src} alt={cur.alt} onClick={(e) => e.stopPropagation()} />
      {many && (
        <button type="button" className="lb-nav next" aria-label="Next photo" onClick={(e) => (e.stopPropagation(), go(1))}>
          ›
        </button>
      )}
      {many && <div className="lb-count">{view.i + 1} / {view.list.length}</div>}
    </div>
  );
}
