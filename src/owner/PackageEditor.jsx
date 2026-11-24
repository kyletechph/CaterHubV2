import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOwner } from './OwnerLayout';
import { useAuth } from '../shared/AuthContext';
import { gate, msg, ok, run, upload, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
import { MENU_LIBRARY, PKG_TYPES } from './constants';
export const CATS = Object.keys(MENU_LIBRARY);
const LEGACY = ['Food', 'Package', 'Setup'];
function EventPick({ value, onChange, options = [] }) {
  const list = value && !options.includes(value) ? [...options, value] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Photo event" style={{ flex: 1, minWidth: 0, padding: '6px 10px' }}>
      <option value="">No specific event</option>
      {list.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}
// group saved rows into [{ category, pick, items: [names] }]. "pick" = how many dishes the customer chooses (0 = all/no limit), stored in the quantity column
const groupMenu = (rows = []) => {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r.category)) m.set(r.category, { category: r.category, pick: r.quantity || 0, items: [] });
    m.get(r.category).items.push(r.item_name);
  });
  return [...m.values()];
};
const BLANK = { name: '', description: '', price: '', price_range: '', min_guests: '', max_guests: '', inclusions: [], tables_chairs: 'Optional', is_customizable: true, is_active: true, package_menu_items: [], package_photos: [] };
export function PackageEditor() {
  const { id } = useParams(),
    isNew = id === 'new',
    { c } = useOwner(),
    { me } = useAuth(),
    nav = useNavigate();
  const s = useLoad(async () => {
    if (isNew) return BLANK;
    return ok(await sb.from('catering_packages').select('*,package_menu_items(*),package_photos(*)').eq('package_id', id).eq('caterer_id', c.caterer_id).maybeSingle());
  }, [id]);
  const [menu, setMenu] = useState(null); // null = untouched; otherwise the edited menu groups
  const [dish, setDish] = useState({}); // text typed per category
  const [newCat, setNewCat] = useState('');
  const [files, setFiles] = useState([]);
  const [delPhotos, setDelPhotos] = useState([]);
  const [meta, setMeta] = useState([]); // event + caption for each new photo
  const [edits, setEdits] = useState({}); // changed event/caption of saved photos, by photo_id
  const [ptypeSel, setPtypeSel] = useState(null);
  const [kindSel, setKindSel] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  const g = gate(s);
  if (g) return g;
  const p = s.data;
  // pricing type: per guest, or one fixed price for a set number of guests (like a family combo)
  const ptype = ptypeSel ?? (p?.price_type === 'fixed' ? 'fixed' : 'per_guest'),
    fixed = ptype === 'fixed';
  const kind = kindSel ?? (p?.package_type === 'food' ? 'food' : 'catering'),
    food = kind === 'food';
  if (!p) return <div className="card"><h3 className="h3">Package not found</h3><Link className="btn" to="/owner/pk">Back to packages</Link></div>;
  const groups = menu ?? groupMenu(p.package_menu_items);
  const pending = (menu ? 1 : 0) + files.length + delPhotos.length + Object.keys(edits).length;
  const edit = (i, patch) => setMenu(groups.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addDish = (i, name) => {
    const n = name.trim().replace(/,$/, '').trim();
    if (!n || groups[i].items.some((x) => x.toLowerCase() === n.toLowerCase())) return;
    edit(i, { items: [...groups[i].items, n] });
    setDish((d) => ({ ...d, [groups[i].category]: '' }));
  };
  const addCat = (name) => {
    const n = name.trim();
    if (!n || groups.some((x) => x.category.toLowerCase() === n.toLowerCase())) return;
    setMenu([...groups, { category: n, pick: 1, items: [] }]);
    setNewCat('');
  };
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = run(async (e) => {
    const f = e.target,
      g = (k) => f.elements.namedItem(k);
    const mx = fixed ? +g('serves').value : +g('max_guests').value,
      mn = fixed ? mx : +g('min_guests').value;
    if (!g('name').value.trim()) throw new Error('Please add a package name.');
    if (!(+g('price').value > 0)) throw new Error(fixed ? 'Enter the package price.' : 'Enter a price per guest.');
    if (fixed && !(mx >= 1)) throw new Error('Enter how many guests this package is good for.');
    if (mn > mx) throw new Error('Minimum guests cannot exceed maximum guests.');
    const body = {
      name: g('name').value.trim(),
      description: g('description').value.trim() || null,
      price: +g('price').value,
      price_range: g('price_range').value.trim() || null,
      min_guests: mn,
      max_guests: mx,
      inclusions: g('inc').value.split('\n').map((x) => x.trim()).filter(Boolean),
      tables_chairs: food ? 'Optional' : g('tc').value,
      is_customizable: g('cust').checked,
    };
    // only sent when it matters, so saving per-guest packages works before the pricing SQL patch is run
    if (food || p.package_type === 'food') body.package_type = kind;
    if (fixed) body.price_type = 'fixed';
    else if (p.price_type === 'fixed') body.price_type = 'per_guest';
    let pid = p.package_id;
    const write = async (row) => (isNew && !pid ? sb.from('catering_packages').insert({ ...row, caterer_id: c.caterer_id, is_active: true }).select('package_id').single() : sb.from('catering_packages').update(row).eq('package_id', pid));
    let r = await write(body);
    // database not updated for the new price-range column yet? save the rest anyway
    if (r.error && /price_range/i.test(r.error.message || '')) {
      delete body.price_range;
      r = await write(body);
    }
    if (r.error && /package_type/i.test(r.error.message || '')) throw new Error('Food packages need a database update. Run supabase/owner/04_package_type.sql in Supabase, then save again.');
    if (r.error && /price_type/i.test(r.error.message || '')) throw new Error('Fixed package pricing needs a database update. Run supabase/owner/03_package_pricing.sql in Supabase, then save again.');
    if (r.error) throw r.error;
    if (isNew && !pid) pid = r.data.package_id;
    if (menu) {
      // add the new list first, then remove the old rows, so a failed save never leaves the menu empty
      const oldIds = p.package_menu_items.map((m) => m.menu_item_id);
      const items = menu.flatMap((x) => x.items.map((name) => ({ package_id: pid, category: x.category, item_name: name, quantity: x.pick || null })));
      if (items.length) {
        const d = await sb.from('package_menu_items').insert(items);
        if (d.error) throw d.error;
      }
      if (oldIds.length) {
        const d = await sb.from('package_menu_items').delete().in('menu_item_id', oldIds);
        if (d.error) throw d.error;
      }
    }
    if (delPhotos.length) {
      const d = await sb.from('package_photos').delete().in('photo_id', delPhotos);
      if (d.error) throw d.error;
    }
    const noEvents = (err) => /event_type/i.test(err.message || '') && new Error('Photo events need a database update. Run supabase/owner/05_photo_events.sql in Supabase, then save again.');
    for (const [pid0, ch] of Object.entries(edits)) {
      if (delPhotos.includes(+pid0)) continue;
      const body = { caption: ch.caption || null };
      if (ch.event_type || p.package_photos.find((x) => x.photo_id === +pid0)?.event_type) body.event_type = ch.event_type || null;
      const d = await sb.from('package_photos').update(body).eq('photo_id', +pid0);
      if (d.error) throw noEvents(d.error) || d.error;
    }
    for (const [i, file] of files.entries()) {
      const url = await upload(file, me.id);
      const row = { package_id: pid, image_url: url, caption: meta[i]?.caption?.trim() || null };
      if (meta[i]?.event) row.event_type = meta[i].event;
      const d = await sb.from('package_photos').insert(row);
      if (d.error) throw noEvents(d.error) || d.error;
    }
    setMenu(null);
    setDish({});
    setFiles([]);
    setMeta([]);
    setEdits({});
    setDelPhotos([]);
    setFileKey((k) => k + 1);
    msg('Changes saved');
    if (isNew) nav('/owner/pk/' + pid, { replace: true });
    else s.reload();
  });
  return (
    <>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <div>
          <h1>{isNew ? 'Add package' : 'Edit package'}</h1>
          <p className="sub">{isNew ? 'Describe your menu so customers know what to expect.' : p.name}</p>
        </div>
        {!isNew && (
          <Link className="lnk" to={'/package/' + id} target="_blank">
            Preview package ↗
          </Link>
        )}
      </div>
      <form onSubmit={save} key={p.updated_at || 'new'} style={{ marginTop: 26 }}>
        <div className="ed">
          <div className="stack">
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 22 }}>
                Package details
              </h3>
              <div className="field">
                <label className="l">Package type *</label>
                <div className="kinds">
                  {PKG_TYPES.map(([v, label, hint]) => (
                    <label className={'kind' + (kind === v ? ' on' : '')} key={v}>
                      <input type="radio" name="kind" checked={kind === v} onChange={() => setKindSel(v)} />
                      <b>{label}</b>
                      <span className="tiny mut">{hint}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="l">Package name *</label>
                <input name="name" defaultValue={p.name} />
              </div>
              <div className="field">
                <label className="l">Description (optional)</label>
                <textarea name="description" rows="3" defaultValue={p.description} placeholder="What makes this package special?" />
              </div>
              <div className="field">
                <label className="l">How is this package priced? *</label>
                <label className="check">
                  <input type="radio" name="ptype" checked={!fixed} onChange={() => setPtypeSel('per_guest')} /> Per guest
                </label>
                <label className="check" style={{ marginTop: 6 }}>
                  <input type="radio" name="ptype" checked={fixed} onChange={() => setPtypeSel('fixed')} /> One fixed price for the whole package (for example a combo for 10 guests)
                </label>
              </div>
              <div className="fgrid">
                <div className="field">
                  <label className="l">{fixed ? 'Package price (₱) *' : 'Price per guest (₱) *'}</label>
                  <input type="number" name="price" min="0" step="any" defaultValue={p.price} />
                </div>
                <div className="field">
                  <label className="l">Or price range (optional)</label>
                  <input name="price_range" placeholder={fixed ? 'e.g. ₱4,000–₱4,500 per package' : 'e.g. ₱350–₱500 per guest'} defaultValue={p.price_range || ''} />
                </div>
                {fixed ? (
                  <div className="field">
                    <label className="l">Good for (number of guests) *</label>
                    <input type="number" name="serves" min="1" defaultValue={p.max_guests} placeholder="e.g. 10" />
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label className="l">Minimum guests *</label>
                      <input type="number" name="min_guests" min="1" defaultValue={p.min_guests} />
                    </div>
                    <div className="field">
                      <label className="l">Maximum guests *</label>
                      <input type="number" name="max_guests" min="1" defaultValue={p.max_guests} />
                    </div>
                  </>
                )}
              </div>
              <label className="check field">
                <input type="checkbox" name="cust" defaultChecked={p.is_customizable} /> Package can be customized
              </label>
              {!food && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="l">Tables and chairs</label>
                  <select name="tc" defaultValue={p.tables_chairs || 'Optional'}>
                    <option>Optional</option>
                    <option>Included</option>
                  </select>
                </div>
              )}
            </div>
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 6 }}>
                Menu
              </h3>
              <p className="tiny mut" style={{ marginBottom: 18 }}>
                Add a category for each kind of food (Beef, Pork, Dessert...). Every category has its own “Customer picks”. Example: Beef 1, Pork 1, Dessert 2. Your package name goes in Package name above, not here.
              </p>
              {groups.length === 0 && <p className="small mut">No categories yet. Add one below.</p>}
              {groups.map((x, i) => {
                const typed = dish[x.category] || '';
                const sugg = (MENU_LIBRARY[x.category] || []).filter((d) => !x.items.some((y) => y.toLowerCase() === d.toLowerCase()));
                return (
                  <div className="mcat" key={x.category}>
                    <div className="mcat-h">
                      <b>{x.category}</b>
                      <label className="small mut">
                        Customer picks{' '}
                        <select value={x.pick} onChange={(e) => edit(i, { pick: +e.target.value })} aria-label={x.category + ' picks'}>
                          <option value={0}>All / no limit</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="x" aria-label={'Remove ' + x.category} onClick={() => setMenu(groups.filter((_, j) => j !== i))}>
                        ×
                      </button>
                    </div>
                    <div className="chips">
                      {x.items.map((d) => (
                        <button type="button" className="tag" key={d} onClick={() => edit(i, { items: x.items.filter((y) => y !== d) })} aria-label={'Remove ' + d}>
                          {d} ×
                        </button>
                      ))}
                    </div>
                    <div className="tiny" style={{ marginTop: 8, color: x.pick > x.items.length ? 'var(--rust)' : 'var(--mut)' }}>
                      {x.items.length === 0
                        ? 'No dishes yet. Add the dishes below.'
                        : x.pick
                          ? `Customer picks ${x.pick} of ${x.items.length} dish${x.items.length === 1 ? '' : 'es'}.${x.pick > x.items.length ? ' Add more dishes so the customer has a choice.' : ''}`
                          : `Customer gets all ${x.items.length} dish${x.items.length === 1 ? '' : 'es'}.`}
                    </div>
                    <input
                      value={typed}
                      onChange={(e) => setDish({ ...dish, [x.category]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addDish(i, typed);
                        }
                      }}
                      onBlur={() => addDish(i, typed)}
                      placeholder={'Type a ' + x.category.toLowerCase() + ' dish and press Enter'}
                      aria-label={'Add ' + x.category + ' dish'}
                      style={{ marginTop: 10, padding: '8px 12px' }}
                    />
                    {sugg.length > 0 && (
                      <div className="chips" style={{ marginTop: 10 }}>
                        <span className="tiny mut">Suggestions:</span>
                        {sugg.map((d) => (
                          <button type="button" className="chip" key={d} onClick={() => addDish(i, d)}>
                            + {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="chips" style={{ marginTop: 6 }}>
                {CATS.filter((c0) => !groups.some((x) => x.category === c0)).map((c0) => (
                  <button type="button" className="chip" key={c0} onClick={() => addCat(c0)}>
                    + {c0}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCat(newCat);
                    }
                  }}
                  placeholder="Other category (e.g. Soup)"
                  aria-label="New category"
                  style={{ padding: '8px 12px' }}
                />
                <button type="button" className="btn" onClick={() => addCat(newCat)}>
                  Add
                </button>
              </div>
            </div>
          </div>
          <div className="stack">
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 16 }}>
                Inclusions
              </h3>
              <label className="l">What's included</label>
              <textarea name="inc" rows="5" defaultValue={(p.inclusions || []).join('\n')} placeholder={food ? 'Rice\nDrinks\nDisposable plates and utensils' : 'Rice\nDrinks\nBuffet setup\nServing staff'} />
              <p className="tiny mut" style={{ marginTop: 6 }}>
                Things every customer gets, one per line. Dishes go in the Menu section.
              </p>
            </div>
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 6 }}>
                Photos
              </h3>
              <p className="tiny mut">Food, package, and event photos. Choose the event each photo belongs to (like Birthday) and add a caption. Customers can filter the gallery by event.</p>
              {p.package_photos.map((h) => {
                const gone = delPhotos.includes(h.photo_id),
                  cur = edits[h.photo_id] || { event_type: h.event_type || '', caption: LEGACY.includes(h.caption) ? '' : h.caption || '' };
                const set = (patch) => setEdits({ ...edits, [h.photo_id]: { ...cur, ...patch } });
                return (
                  <div className="photo-card" key={h.photo_id} style={gone ? { opacity: 0.4 } : null}>
                    <img src={h.image_url} alt="" />
                    <div className="cap" style={{ flexWrap: 'wrap' }}>
                      <EventPick value={cur.event_type} onChange={(v) => set({ event_type: v })} options={c.event_types} />
                      <button type="button" className="lnk small" onClick={() => toggle(delPhotos, setDelPhotos, h.photo_id)}>
                        {gone ? 'Undo' : 'Remove'}
                      </button>
                      <input value={cur.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" maxLength={120} aria-label="Photo caption" style={{ flexBasis: '100%', marginTop: 8, padding: '8px 12px' }} />
                    </div>
                  </div>
                );
              })}
              {files.map((f, i) => {
                const m = meta[i] || { event: '', caption: '' };
                const set = (patch) => setMeta(files.map((_, j) => (j === i ? { ...m, ...patch } : meta[j] || { event: '', caption: '' })));
                return (
                  <div className="photo-card" key={i}>
                    <img src={previews[i]} alt="" />
                    <div className="cap" style={{ flexWrap: 'wrap' }}>
                      <EventPick value={m.event} onChange={(v) => set({ event: v })} options={c.event_types} />
                      <button
                        type="button"
                        className="lnk small"
                        onClick={() => {
                          setFiles(files.filter((_, j) => j !== i));
                          setMeta(meta.filter((_, j) => j !== i));
                        }}
                      >
                        Remove
                      </button>
                      <input value={m.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" maxLength={120} aria-label="Photo caption" style={{ flexBasis: '100%', marginTop: 8, padding: '8px 12px' }} />
                    </div>
                  </div>
                );
              })}
              <div className="dropz">
                <div className="plus">+ Upload photos</div>
                <p className="tiny mut" style={{ margin: '4px 0 12px' }}>
                  JPG, PNG, or WebP · Max 2 MB each
                </p>
                <input
                  key={fileKey}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choose photos"
                  onChange={(e) => {
                    const add = Array.from(e.target.files);
                    setFiles([...files, ...add]);
                    setMeta([...files.map((_, j) => meta[j] || { event: '', caption: '' }), ...add.map(() => ({ event: '', caption: '' }))]);
                  }}
                />
              </div>
              <p className="tiny mut" style={{ marginTop: 12 }}>
                Photographs are visible on your public package page. Keep private business information out of uploaded images.
              </p>
            </div>
          </div>
        </div>
        <div className="savebar">
          <div>
            <b>Status: {p.is_active === false ? 'Inactive' : 'Active'}</b>
            <div className="small mut">
              {pending > 0 ? `You have ${pending} unsaved menu/photo change${pending > 1 ? 's' : ''}. ` : ''}Changes update your public package after saving.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Link className="lnk mut" to="/owner/pk">
              Cancel
            </Link>
            <button className="btn">Save changes</button>
          </div>
        </div>
      </form>
    </>
  );
}
