import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, gate, ok, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
export function Gallery() {
  const { id } = useParams();
  const [ev, setEv] = useState(''); // '' = every event
  const s = useLoad(async () => {
    const q = (cols) => sb.from('caterer_profiles').select(`*,catering_packages(is_active,package_photos(${cols}))`).eq('caterer_id', id).maybeSingle();
    let r = await q('image_url,caption,event_type');
    if (r.error) r = await q('image_url,caption'); // photo events are not set up in the database yet
    return ok(r);
  }, [id]);
  const g = gate(s);
  if (g) return g;
  const c = s.data;
  if (!c || c.status !== 'Published') return <Empty>Caterer not found.</Empty>;
  const photos = c.catering_packages
    .filter((p) => p.is_active)
    .flatMap((p) => p.package_photos)
    .slice(0, 60);
  const events = [...new Set([...(c.event_types || []), ...photos.map((p) => p.event_type).filter(Boolean)])],
    shown = ev ? photos.filter((p) => p.event_type === ev) : photos,
    LEGACY = ['Food', 'Package', 'Setup'],
    caption = (p) => (!p.caption ? '' : LEGACY.includes(p.caption) ? p.caption + ' photo' : p.caption);
  return (
    <div className="wrap page">
      <Link className="lnk small" to={'/caterer/' + id}>
        ← {c.business_name}
      </Link>
      <h1 className="h1" style={{ marginTop: 22 }}>
        Picture your next celebration.
      </h1>
      <p className="sub">Food &amp; event setup gallery</p>
      {photos.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 26 }}>
          <h3>No gallery photos yet</h3>
          <p>This caterer has not added event photos. Ask them for recent examples when you send an inquiry.</p>
        </div>
      ) : (
        <>
          {events.length > 0 && (
            <div className="chips" style={{ marginTop: 22 }} role="group" aria-label="Filter photos by event">
              <button type="button" className={'chip' + (ev === '' ? ' on' : '')} onClick={() => setEv('')}>
                All events ({photos.length})
              </button>
              {events.map((e) => (
                <button type="button" key={e} className={'chip' + (ev === e ? ' on' : '')} onClick={() => setEv(e)}>
                  {e} ({photos.filter((p) => p.event_type === e).length})
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 22 }}>
              <h3>No {ev.toLowerCase()} photos yet</h3>
              <p>This caterer has not added {ev.toLowerCase()} photos. Ask them for recent examples when you send an inquiry.</p>
            </div>
          ) : (
            <div className="cards3" style={{ marginTop: 22 }}>
              {shown.map((p, i) => (
                <div className="cv" key={i}>
                  <div className="ph" style={{ aspectRatio: '1.5' }}>
                    <img src={p.image_url} alt={caption(p) || p.event_type || ''} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    {p.event_type && <span className="tag">{p.event_type}</span>}
                    {caption(p) && (
                      <p className="small mut" style={{ margin: p.event_type ? '8px 0 0' : 0 }}>
                        {caption(p)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
