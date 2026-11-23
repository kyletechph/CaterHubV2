import { useState } from 'react';
import { VerifiedBadge } from '../shared/Reviews';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Arrow, Bookmark, Swap } from '../shared/Icons';
import { COVERS, fromLabel, fromPrice, gate, perGuest, msg, ok, peso, shortDay, useLoad } from '../shared/lib';
import { COMPARE_MAX, useList } from '../shared/saved';
import { sb } from '../shared/supabase';
export const BUDGETS = [
  ['', 'Any budget'],
  ['0-200', 'Up to ₱200 / guest'],
  ['200-500', '₱200 – ₱500 / guest'],
  ['500-', '₱500 and up / guest'],
];
const SORTS = [
  ['name', 'Name A–Z'],
  ['low', 'Price: low to high'],
  ['high', 'Price: high to low'],
];
// the owner's cover photo is the background with the logo in a circle in the middle
// (no cover photo yet: a blurred copy of the logo is the background; package photos are never used here)
const media = (c, i) => {
  if (c.cover_image) return { src: c.cover_image, badge: c.logo || null, blur: false };
  if (c.logo) return { src: c.logo, badge: c.logo, blur: true };
  return { src: COVERS[i % COVERS.length], badge: null, blur: false };
};
const budgetLabel = (v) => (BUDGETS.find((b) => b[0] === v) || [])[1] || v;
// keep the choices a visitor made (date, guests) when they open a profile
export const carry = (q) => {
  const p = new URLSearchParams();
  ['date', 'guests'].forEach((k) => q[k] && p.set(k, q[k]));
  return p.toString() ? '?' + p : '';
};
export function matches(c, q, blocked) {
  const prices = c.catering_packages.filter((p) => p.is_active).map(perGuest),
    mn = prices.length ? Math.min(...prices) : null,
    n = parseInt(q.guests);
  let [a, b] = (q.budget || '').split('-').map((x) => (x === '' || x === undefined ? NaN : parseFloat(x)));
  return (
    (!q.name || c.business_name.toLowerCase().includes(q.name.toLowerCase())) &&
    (!q.area ||
      c.out_of_town ||
      c.service_areas.some((x) => x.area_name.toLowerCase().includes(q.area.trim().toLowerCase()))) &&
    (!q.event || c.event_types.some((e) => e.toLowerCase().includes(q.event.trim().toLowerCase()))) &&
    (!n || (n >= c.min_guests && n <= c.max_guests)) &&
    (isNaN(a) || (mn !== null && mn >= a)) &&
    (isNaN(b) || (mn !== null && mn <= b)) &&
    !blocked.has(c.caterer_id)
  );
}
export function List() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const wide = () => window.matchMedia('(min-width: 721px)').matches,
    [open, setOpen] = useState(wide),
    [loc, setLoc] = useState(''); // location search is kept only on this screen, not in the URL
  const q = Object.fromEntries(sp);
  const [saved, toggleSaved] = useList('saved');
  const [cmp, toggleCmp] = useList('compare');
  const s = useLoad(
    async () =>
      ok(
        await sb
          .from('caterer_profiles')
          .select('*,service_areas(area_name),catering_packages(price,is_active,is_customizable,package_photos(image_url))')
          .eq('status', 'Published')
          .order('business_name'),
      ),
    [],
  );
  // caterers that already have this date marked Reserved or Unavailable
  const bl = useLoad(async () => {
    if (!q.date) return [];
    const r = await sb
      .from('caterer_availability')
      .select('caterer_id')
      .eq('day', q.date)
      .in('status', ['Reserved', 'Unavailable']);
    return r.error ? [] : r.data.map((x) => x.caterer_id);
  }, [q.date]);
  const g = gate(s);
  if (g) return g;
  const all = s.data,
    blocked = new Set(bl.data || []);
  const areas = [...new Map(all.flatMap((c) => c.service_areas.map((a) => a.area_name.trim().replace(/\s+/g, ' '))).map((n) => [n.toLowerCase(), n])).values()].sort();
  const events = [...new Set(all.flatMap((c) => c.event_types))].sort();
  const activeFilters = ['event', 'budget', 'guests', 'date'].filter((k) => q[k]).length + (loc ? 1 : 0);
  const sort = q.sort || 'name';
  const rows = all
    .filter((c) => matches(c, { ...q, area: loc }, blocked))
    .sort((x, y) =>
      sort === 'name'
        ? x.business_name.localeCompare(y.business_name)
        : ((fromPrice(x) ?? 1e9) - (fromPrice(y) ?? 1e9)) * (sort === 'low' ? 1 : -1),
    );
  const set = (obj) => {
    const n = { ...q, ...obj };
    Object.keys(n).forEach((k) => !n[k] && delete n[k]);
    setSp(n);
  };
  const apply = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const n = {};
    ['event', 'budget', 'guests', 'date'].forEach((k) => (n[k] = String(f.get(k) || '').trim()));
    setLoc(String(f.get('area') || '').trim());
    if (q.name) n.name = q.name;
    if (q.sort) n.sort = q.sort;
    Object.keys(n).forEach((k) => !n[k] && delete n[k]);
    setSp(n);
    if (!wide()) setOpen(false);
  };
  const chips = [
    q.name && ['name', `"${q.name}"`],
    loc && ['area', loc],
    q.event && ['event', q.event],
    q.guests && ['guests', `${q.guests} guests`],
    q.budget && ['budget', budgetLabel(q.budget)],
    q.date && ['date', shortDay(q.date)],
  ].filter(Boolean);
  const pickCompare = (id) => {
    if (!toggleCmp(id)) msg(`You can compare up to ${COMPARE_MAX} caterers. Remove one first.`, 1);
  };
  return (
    <div className="wrap page">
      <h1 className="h1">Find your kind of caterer.</h1>
      <p className="sub">Local kitchens, thoughtful menus, and a package for every gathering.</p>
      <form
        style={{ marginTop: 26 }}
        onSubmit={(e) => {
          e.preventDefault();
          set({ name: String(new FormData(e.target).get('name') || '').trim() });
        }}
      >
        <label className="l" htmlFor="nm" style={{ fontSize: 12, fontWeight: 500 }}>
          Search by business name
        </label>
        <div className="dir-search">
          <input id="nm" name="name" type="search" defaultValue={q.name || ''} placeholder="Search caterers…" />
          <button className="btn">Search</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" className="btn out sm" style={{ minWidth: 170 }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide filters' : 'Filters'}
            {activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
          <Link className="btn out sm" to="/saved" style={{ minWidth: 170 }}>
            Saved caterers ({saved.length})
          </Link>
        </div>
      </form>
      {open && (
        <form className="filters bar" onSubmit={apply} key={sp.toString()} style={{ marginTop: 16 }}>
          <div className="field">
            <label className="l">Location</label>
            <input name="area" list="dir-areas" defaultValue={loc} placeholder="Any location" autoComplete="off" />
            <datalist id="dir-areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label className="l">Event type</label>
            <input name="event" list="dir-events" defaultValue={q.event || ''} placeholder="Type or pick an event" autoComplete="off" />
            <datalist id="dir-events">
              {events.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label className="l">Budget per guest</label>
            <select name="budget" defaultValue={q.budget || ''}>
              {BUDGETS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="l">Guest count</label>
            <input type="number" name="guests" min="1" defaultValue={q.guests || ''} placeholder="e.g. 100" />
          </div>
          <div className="field">
            <label className="l">Event date (optional)</label>
            <input type="date" name="date" defaultValue={q.date || ''} />
          </div>
          <div className="filters-actions">
            <button className="btn">Apply filters</button>
            <button type="button" className="btn out" onClick={() => (setLoc(''), !wide() && setOpen(false), nav('/caterers'))}>
              Reset
            </button>
          </div>
        </form>
      )}
      <div className="dir-grid solo" style={{ marginTop: 6 }}>
        <div>
          <div className="results-head">
            <b>
              {rows.length} caterer{rows.length === 1 ? '' : 's'} match{rows.length === 1 ? 'es' : ''} your search
            </b>
            <label className="small mut">
              Sort:{' '}
              <select value={sort} onChange={(e) => set({ sort: e.target.value === 'name' ? '' : e.target.value })}>
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="chips" style={{ marginBottom: 18 }}>
              {chips.map(([k, l]) => (
                <button key={k} type="button" className="tag" onClick={() => (k === 'area' ? setLoc('') : set({ [k]: '' }))}>
                  {l} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
          {rows.length === 0 && (
            <div className="empty-state">
              <h3>No caterers found</h3>
              <p>Try a wider budget, fewer guests, a different event type, or a different business name.</p>
              <button className="btn" onClick={() => (setLoc(''), nav('/caterers'))}>
                Reset filters
              </button>
            </div>
          )}
          <div className="ccards">
            {rows.map((c, i) => {
              const m = media(c, i),
                label = fromLabel(c),
                isSaved = saved.includes(c.caterer_id),
                isCmp = cmp.includes(c.caterer_id),
                custom = c.catering_packages.some((x) => x.is_active && x.is_customizable),
                area = c.service_areas[0]?.area_name || 'Calbayog City',
                text = c.tagline || c.description;
              return (
                <article className="ccard" key={c.caterer_id}>
                  <div className="cc-media">
                    <div className="cc-clip">
                      <img className={m.blur ? 'blur' : ''} src={m.src} alt="" />
                    </div>
                    <div className="cc-btns">
                      <button type="button" className={'cc-btn' + (isSaved ? ' on' : '')} aria-pressed={isSaved} onClick={() => toggleSaved(c.caterer_id)}>
                        <Bookmark on={isSaved} /> {isSaved ? 'Saved' : 'Save'}
                      </button>
                      <button type="button" className={'cc-btn' + (isCmp ? ' on' : '')} aria-pressed={isCmp} onClick={() => pickCompare(c.caterer_id)}>
                        <Swap /> {isCmp ? 'Selected' : 'Compare'}
                      </button>
                    </div>
                    {m.badge && (
                      <span className="cc-logo">
                        <img src={m.badge} alt={c.business_name + ' logo'} />
                      </span>
                    )}
                  </div>
                  <div className={'cc-body' + (m.badge ? ' has-logo' : '')}>
                    <h3>
                      <Link className="cat-link" to={'/caterer/' + c.caterer_id + carry(q)}>
                        {c.business_name}
                      </Link>
                      {c.is_verified && <VerifiedBadge size={18} />}
                    </h3>
                    <div className="cc-loc">
                      {area}
                      {c.out_of_town ? ' · Accepts out-of-town events' : ''}
                    </div>
                    {text && <p className="cc-text">{text}</p>}
                    {q.date && <span className="etag ok">Available {shortDay(q.date)}</span>}
                    <div className="cc-meta">
                      {c.min_guests}–{c.max_guests} guests · {custom ? 'Customizable packages' : 'Set packages'}
                    </div>
                    <div className="cc-price">{label || 'Packages on request'}</div>
                    <div className="cc-go">
                      <span className="lnk">View profile →</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {cmp.length > 0 && (
            <div className="tray">
              <span>
                <span className="num">{cmp.length}</span>
                {cmp.length} caterer{cmp.length === 1 ? '' : 's'} selected
              </span>
              <Link className="lnk small" to="/compare">
                Compare <Arrow />
              </Link>
            </div>
          )}
          <p className="tiny mut" style={{ marginTop: 14 }}>
            Showing {rows.length} of {all.length} caterers
          </p>
        </div>
      </div>
    </div>
  );
}