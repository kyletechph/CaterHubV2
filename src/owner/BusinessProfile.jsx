import { useEffect, useState } from 'react';
import { useOwner } from './OwnerLayout';
import { useAuth } from '../shared/AuthContext';
import { Link } from 'react-router-dom';
import { run, msg, upload } from '../shared/lib';
import { sb } from '../shared/supabase';
import { VerificationCard } from './Verification';
const split = (t) => [...new Set(t.split(',').map((a) => a.trim()).filter(Boolean))];
export function ProfileTab() {
  const { c, reload } = useOwner(),
    { me } = useAuth(),
    x = c || {};
  // area names other caterers already use, so everyone spells them the same way
  const [known, setKnown] = useState([]);
  useEffect(() => {
    sb.from('service_areas')
      .select('area_name')
      .then((r) => {
        if (r.error) return;
        const seen = new Map();
        r.data.forEach((a) => {
          const n = a.area_name.trim().replace(/\s+/g, ' ');
          if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
        });
        setKnown([...seen.values()].sort());
      });
  }, []);
  const [v, setV] = useState({
    business_name: x.business_name || '',
    tagline: x.tagline || '',
    description: x.description || '',
    contact_number: x.contact_number || '',
    email: x.email || '',
    address: x.address || '',
    map_link: x.map_link || '',
    areas: (x.service_areas || []).map((a) => a.area_name).join(', '),
    note: x.note || '',
    min_guests: x.min_guests ?? '',
    max_guests: x.max_guests ?? '',
    out_of_town: !!x.out_of_town,
  });
  const [sel, setSel] = useState(() => new Set(x.event_types || []));
  const [extra, setExtra] = useState(() => x.event_types || []);
  const [newEv, setNewEv] = useState('');
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null),
    [coverFile, setCoverFile] = useState(null),
    [dropCover, setDropCover] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const status = x.status || 'Draft',
    list = extra,
    checks = [
      ['Business name', v.business_name.trim()],
      ['Contact number', v.contact_number.trim()],
      ['At least one service area', split(v.areas).length > 0],
      ['At least one event type', sel.size > 0],
      ['Valid minimum and maximum guests', +v.max_guests > 0 && +v.min_guests <= +v.max_guests],
    ],
    complete = checks.every(([, ok]) => ok);
  const addEv = () => {
    const t = newEv.trim();
    if (!t) return;
    if (list.some((e) => e.toLowerCase() === t.toLowerCase())) return msg('That event type is already in the list.', 1);
    setExtra([...extra, t]);
    setSel(new Set([...sel, t]));
    setNewEv('');
    setAdding(false);
  };
  const rmEv = (t) => {
    setExtra((l) => l.filter((e) => e !== t));
    setSel((s) => {
      const n = new Set(s);
      n.delete(t);
      return n;
    });
  };
  // target: 'Draft' | 'Published' | 'Deactivated'
  const save = (target) =>
    run(async () => {
      setErr('');
      if (target === 'Published' && !complete) {
        const m = 'To publish, complete everything in the publishing checklist.';
        setErr(m);
        throw new Error(m);
      }
      if (!v.business_name.trim() || !v.contact_number.trim()) {
        const m = 'Business name and contact number are required.';
        setErr(m);
        throw new Error(m);
      }
      if (+v.min_guests > +v.max_guests) throw new Error('Min guests cannot exceed max guests.');
      const link = v.map_link.trim();
      if (link && !/^https?:\/\//i.test(link)) throw new Error('Map link must start with http:// or https://');
      const types = list.filter((e) => sel.has(e));
      const row = {
        business_name: v.business_name.trim(),
        tagline: v.tagline.trim() || null,
        contact_number: v.contact_number.trim(),
        email: v.email.trim() || null,
        address: v.address.trim() || null,
        map_link: link || null,
        logo: file ? await upload(file, me.id) : x.logo || null,
        description: v.description.trim(),
        note: v.note.trim(),
        min_guests: +v.min_guests || 0,
        max_guests: +v.max_guests || 0,
        out_of_town: v.out_of_town,
        status: target,
        event_types: types,
      };
      // only touched when the owner changes the cover photo, so saving still works before the cover SQL patch is run
      if (coverFile) row.cover_image = await upload(coverFile, me.id);
      else if (dropCover) row.cover_image = null;
      let id = x.caterer_id;
      const write = (r) => (id ? sb.from('caterer_profiles').update(r).eq('caterer_id', id) : sb.from('caterer_profiles').insert({ ...r, user_id: me.id }).select('caterer_id').single());
      let r = await write(row);
      // database not updated for the tagline column yet? save the rest anyway
      if (r.error && /tagline/i.test(r.error.message || '')) {
        delete row.tagline;
        r = await write(row);
      }
      if (r.error) throw r.error;
      if (!id) id = r.data.caterer_id;
      const canon = (n) => {
        const t = n.replace(/\s+/g, ' ').trim();
        return known.find((k) => k.toLowerCase() === t.toLowerCase()) || t;
      };
      const names = [...new Set(split(v.areas).map(canon))];
      let d = await sb.from('service_areas').delete().eq('caterer_id', id);
      if (d.error) throw d.error;
      if (names.length) {
        d = await sb.from('service_areas').insert(names.map((area_name) => ({ caterer_id: id, area_name })));
        if (d.error) throw d.error;
      }
      msg(target === 'Published' ? 'Profile saved. You are visible in the public directory.' : target === 'Deactivated' ? 'Profile deactivated. It is hidden from customers.' : 'Profile saved.');
      setExtra((l) => l.filter((t) => types.includes(t)));
      setFile(null);
      setCoverFile(null);
      setDropCover(false);
      reload();
    });
  const first = status === 'Draft';
  return (
    <>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <div>
          <h1>{first ? 'Set up your business' : 'Business profile'}</h1>
          <p className="sub">
            {first ? 'Welcome to CaterHub. Complete your public details, save a draft, then publish when ready.' : 'Make it easy for customers to find and understand your business.'}
          </p>
        </div>
        {x.caterer_id && status === 'Published' && (
          <Link className="lnk" to={'/caterer/' + x.caterer_id}>
            Preview profile ↗
          </Link>
        )}
      </div>
      {err && (
        <div className="warn-b" role="alert" style={{ marginTop: 22 }}>
          <b>Your changes weren't saved</b>
          <span className="small">{err}</span>
        </div>
      )}
      <div className="bp" style={{ marginTop: 26 }}>
        <div className="stack">
          <div className="card">
            <h3 className="sec-h">Business details</h3>
            <p className="tiny mut" style={{ marginBottom: 20 }}>
              * Required to publish
            </p>
            <div className="field">
              <label className="l">Business name *</label>
              <input value={v.business_name} onChange={set('business_name')} />
            </div>
            <div className="field">
              <label className="l">Tagline</label>
              <input value={v.tagline} onChange={set('tagline')} maxLength={90} placeholder="e.g. Unforgettable flavors. Effortless celebrations." />
            </div>
            <div className="field">
              <label className="l">Description (optional)</label>
              <textarea rows="4" value={v.description} onChange={set('description')} placeholder="Tell customers about your business, your specialties and what makes you different." />
            </div>
            <div className="fgrid">
              <div className="field">
                <label className="l">Business contact number *</label>
                <input value={v.contact_number} onChange={set('contact_number')} />
              </div>
              <div className="field">
                <label className="l">Business email</label>
                <input type="email" value={v.email} onChange={set('email')} />
              </div>
            </div>
            <div className="field">
              <label className="l">Business address</label>
              <input value={v.address} onChange={set('address')} maxLength={200} placeholder="Street, Barangay, Calbayog City" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="l">Map link (optional)</label>
              <input type="url" value={v.map_link} onChange={set('map_link')} maxLength={500} placeholder="Paste your Google Maps link" />
            </div>
          </div>
          <div className="card">
            <h3 className="sec-h" style={{ marginBottom: 20 }}>
              Where and who you serve
            </h3>
            <div className="field">
              <label className="l">Service areas * (comma separated)</label>
              <input value={v.areas} onChange={set('areas')} placeholder="Calbayog City, Catbalogan City" />
              {(() => {
                const used = split(v.areas).map((a) => a.toLowerCase()),
                  tips = known.filter((k) => !used.includes(k.toLowerCase()));
                return (
                  tips.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="tiny mut" style={{ marginBottom: 6 }}>
                        Already used by other caterers. Tap to add the same spelling:
                      </div>
                      <div className="evchips" style={{ margin: 0 }}>
                        {tips.map((k) => (
                          <button type="button" className="sugg" key={k} onClick={() => setV((o) => ({ ...o, areas: [...split(o.areas), k].join(', ') }))}>
                            + {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                );
              })()}
            </div>
            <div className="field">
              <label className="l">Out-of-town events (optional)</label>
              <label className="check">
                <input type="checkbox" checked={v.out_of_town} onChange={set('out_of_town')} /> I accept out-of-town events
              </label>
              <p className="tiny mut" style={{ marginTop: 6 }}>
                Leave this unchecked if you prefer to talk about out-of-town events with each customer.
              </p>
            </div>
            <div className="field">
              <label className="l">Travel note (optional)</label>
              <textarea rows="2" value={v.note} onChange={set('note')} placeholder="Free delivery within the city. Ask about delivery fees for out-of-town events." />
            </div>
            <label className="l">Event types *</label>
            {list.length === 0 && <p className="tiny mut">No event types yet. Add the events your business caters.</p>}
            <div className="evchips">
              {list.map((e) => (
                <span className="evchip" key={e}>
                  {e}
                  <button type="button" aria-label={'Remove ' + e} onClick={() => rmEv(e)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            {adding || list.length === 0 ? (
              <div className="add-ev">
                <input value={newEv} onChange={(e) => setNewEv(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEv())} placeholder="Type a new event type (e.g. Christening)" maxLength={60} autoFocus />
                <button type="button" className="btn out sm" onClick={addEv}>
                  Add
                </button>
              </div>
            ) : (
              <button type="button" className="lnk small" onClick={() => setAdding(true)}>
                + Add event type
              </button>
            )}
            <div className="fgrid" style={{ marginTop: 20 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="l">Minimum guest capacity *</label>
                <input type="number" min="0" value={v.min_guests} onChange={set('min_guests')} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="l">Maximum guest capacity *</label>
                <input type="number" min="0" value={v.max_guests} onChange={set('max_guests')} />
              </div>
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3 className="sec-h" style={{ marginBottom: 14 }}>
              Publication
            </h3>
            <div className="status-box">
              <b>{status}</b>
              <span>{status === 'Published' ? 'Visible in the public directory' : status === 'Deactivated' ? 'Hidden. Your records are preserved.' : 'Not visible until you publish'}</span>
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: '22px 0 0' }}>Publishing checklist</h4>
            <ul className="cklist">
              {checks.map(([l, done]) => (
                <li key={l} className={done ? '' : 'no'}>
                  {l}
                </li>
              ))}
            </ul>
            {status === 'Published' ? (
              <>
                <button className="btn block" onClick={save('Published')}>
                  Save changes
                </button>
                <p style={{ margin: '14px 0 6px' }}>
                  <button className="lnk small" onClick={save('Deactivated')}>
                    Deactivate profile
                  </button>
                </p>
                <p className="tiny mut" style={{ margin: 0 }}>
                  Deactivating hides your profile and packages. Existing records stay private and available to you.
                </p>
              </>
            ) : (
              <>
                <button className="btn block" onClick={save('Published')}>
                  {status === 'Deactivated' ? 'Reactivate profile' : 'Publish profile'}
                </button>
                <p style={{ margin: '14px 0 6px' }}>
                  <button className="lnk small" onClick={save(status === 'Deactivated' ? 'Deactivated' : 'Draft')}>
                    {status === 'Deactivated' ? 'Save changes' : 'Save as draft'}
                  </button>
                </p>
                <p className="tiny mut" style={{ margin: 0 }}>
                  {complete ? 'Your required details are complete. Publish when you are ready to appear in the public caterer directory.' : 'Finish the checklist to publish.'}
                </p>
              </>
            )}
          </div>
          <div className="card">
            <h3 className="sec-h" style={{ marginBottom: 14 }}>
              Cover photo
            </h3>
            {(coverFile || (x.cover_image && !dropCover)) && (
              <img
                src={coverFile ? URL.createObjectURL(coverFile) : x.cover_image}
                alt="Cover"
                style={{ width: '100%', aspectRatio: '2 / 1', objectFit: 'cover', margin: '0 0 14px', borderRadius: 10, border: '1px solid var(--line)' }}
              />
            )}
            <div className="dropz">
              <div className="plus">+ Upload cover photo</div>
              <p className="tiny mut" style={{ margin: '4px 0 10px' }}>
                JPG, PNG, or WebP · Max 2 MB · Wide photo (about 1200×600) works best
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Cover photo"
                onChange={(e) => {
                  setCoverFile(e.target.files[0] || null);
                  setDropCover(false);
                }}
              />
            </div>
            {(coverFile || (x.cover_image && !dropCover)) && (
              <button
                type="button"
                className="lnk"
                style={{ marginTop: 12, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                onClick={() => {
                  setCoverFile(null);
                  setDropCover(true);
                }}
              >
                Remove cover photo
              </button>
            )}
            <p className="tiny mut" style={{ marginTop: 12 }}>
              Shown behind your logo on your card in the caterer directory. Your package photos stay inside your packages and are not used here.
            </p>
          </div>
          <div className="card">
            <h3 className="sec-h" style={{ marginBottom: 14 }}>
              Business logo
            </h3>
            {(x.logo || file) && (
              <img src={file ? URL.createObjectURL(file) : x.logo} alt="Logo" style={{ maxHeight: 120, margin: '0 0 14px', borderRadius: 10, background: '#fff', border: '1px solid var(--line)' }} />
            )}
            <div className="dropz">
              <div className="plus">+ Upload logo or profile image</div>
              <p className="tiny mut" style={{ margin: '4px 0 10px' }}>
                JPG, PNG, or WebP · Max 2 MB
              </p>
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Logo" onChange={(e) => setFile(e.target.files[0] || null)} />
            </div>
            <p className="tiny mut" style={{ marginTop: 12 }}>
              Your logo appears on your public profile.
            </p>
          </div>
          <div className="box sage" style={{ padding: 26 }}>
            <h3 className="h3" style={{ marginBottom: 10, fontSize: 18 }}>
              Keep private details private.
            </h3>
            <p className="small mut">
              Only public business information belongs in this profile. Never add secret recipes, private costing, or internal notes to the description or public photos.
            </p>
            <b className="tiny" style={{ color: 'var(--sage-ink)' }}>
              You manage only your own business.
            </b>
          </div>
        </div>
      </div>
      {first && (
        <div className="box rust" style={{ marginTop: 24, padding: '22px 26px', display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 600 }}>Setting up for the first time?</h3>
            <p className="small mut" style={{ margin: 0 }}>
              Save your profile as Draft while you prepare. Publish becomes available when all required fields are complete. An inactive profile can be reactivated once it passes the same checks.
            </p>
          </div>
          <button className="btn soft" onClick={save('Draft')}>
            Save as draft
          </button>
        </div>
      )}
      <VerificationCard c={c} reload={reload} />
    </>
  );
}