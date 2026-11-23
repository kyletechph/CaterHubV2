import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { carry } from './CatererList';
import { copyLink, mapUrl } from './mapLinks';
import { Arrow, Bookmark } from '../shared/Icons';
import { Empty, gate, guestsLabel, msg, ok, peso, priceLabel, useLoad } from '../shared/lib';
import { useAuth } from '../shared/AuthContext';
import { COMPARE_MAX, useList } from '../shared/saved';
import { sb } from '../shared/supabase';
import { Reviews, VerifiedBadge } from '../shared/Reviews';
// shows the whole picture: wide photos fill the tile, logos and tall pictures are shown uncropped
// over a blurred copy of themselves, so there are no white bars
function Tile({ t }) {
  const ref = useRef(null),
    [st, setSt] = useState({ fit: 'contain', ok: false });
  const done = (img) =>
    setSt({ fit: !t.logo && img.naturalWidth / img.naturalHeight >= 1.6 ? 'cover' : 'contain', ok: true });
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth) done(img);
  }, [t.src]);
  return (
    <div className="tile">
      <img className="tile-bg" src={t.src} alt="" aria-hidden="true" />
      <img
        ref={ref}
        className={'tile-fg ' + st.fit + (st.ok ? ' ok' : '')}
        src={t.src}
        alt=""
        onLoad={(e) => done(e.target)}
        onError={() => setSt((o) => ({ ...o, ok: true }))}
      />
    </div>
  );
}
export function Profile() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { me } = useAuth();
  const q = Object.fromEntries(sp);
  const [cmp, toggleCmp] = useList('compare');
  const [tab, setTab] = useState('overview');
  const s = useLoad(
    async () =>
      ok(
        await sb
          .from('caterer_profiles')
          .select('*,service_areas(area_name),catering_packages(*,package_photos(image_url))')
          .eq('caterer_id', id)
          .maybeSingle(),
      ),
    [id],
  );
  const g = gate(s);
  if (g) return g;
  const c = s.data;
  if (!c || c.status !== 'Published')
    return (
      <Empty>
        <h3 className="h3">Caterer not found</h3>
        <p className="mut">This profile is not available. It may be a draft or no longer active.</p>
        <Link className="btn" to="/caterers">
          Browse caterers
        </Link>
      </Empty>
    );
  const ps = c.catering_packages.filter((p) => p.is_active),
    photos = ps.flatMap((p) => p.package_photos.map((x) => x.image_url)),
    tiles = [c.cover_image && { src: c.cover_image }, c.logo && { src: c.logo, logo: true }, ...photos.map((src) => ({ src }))].filter(Boolean).slice(0, 2),
    inCmp = cmp.includes(c.caterer_id),
    map = mapUrl(c),
    area = c.service_areas.map((a) => a.area_name).join(', ') || 'Calbayog City',
    custom = ps.some((p) => p.is_customizable),
    inquire = `/inquire/${c.caterer_id}${carry(q)}`;
  const goto = (t) => {
    setTab(t);
    document.getElementById(t)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="wrap page">
      {me?.id === c.user_id && (
        <div className="owner-bar">
          <span className="small mut">You are previewing how customers see your profile.</span>
          <Link className="btn out sm" to="/owner/pf">
            ← Back to business profile
          </Link>
        </div>
      )}
      <div className="crumbs">
        <Link to="/caterers">Browse caterers</Link>
        <i>/</i>
        {c.business_name}
      </div>
      <div className={'gal' + (tiles.length < 2 ? ' one' : '')}>
        {tiles.length === 0 && <div className="mut">No photos yet</div>}
        {tiles.map((t, i) => (
          <Tile key={i} t={t} />
        ))}
      </div>
      <div className="pf-head">
        <div>
          <h1>
            {c.business_name}
            {c.is_verified && <VerifiedBadge size={30} />}
          </h1>
          <p className="sub" style={{ marginTop: 10 }}>
            {c.tagline || 'Local catering for your celebrations.'}
          </p>
          <div className="tags-row">
            <span className="pill sage">{area}</span>
            {custom && <span className="pill rust">Customizable menus</span>}
          </div>
        </div>
        <div className="pf-cta">
          <Link className="btn" to={inquire}>
            Send an inquiry <Arrow />
          </Link>
          <button
            type="button"
            className="btn out"
            onClick={() => !toggleCmp(c.caterer_id) && msg(`You can compare up to ${COMPARE_MAX} caterers.`, 1)}
          >
            <Bookmark on={inCmp} /> {inCmp ? 'Selected to compare' : 'Save to compare'}
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ['packages', 'Packages'],
          ['gallery', 'Gallery'],
          ['availability', 'Availability'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => goto(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="pf-grid" id="overview" style={{ scrollMarginTop: 90 }}>
        <div>
          <h2 className="h2" style={{ fontSize: 26 }}>
            Good food brings people together.
          </h2>
          {c.description && (
            <p className="mut" style={{ marginTop: 14, maxWidth: 560, whiteSpace: 'pre-line' }}>
              {c.description}
            </p>
          )}
          <h2 className="sec-t" id="packages" style={{ scrollMarginTop: 90 }}>
            For your next gathering
          </h2>
          {ps.length === 0 ? (
            <p className="mut">This caterer has not published any packages yet.</p>
          ) : (
            [['catering', 'Catering packages'], ['food', 'Food packages']].map(([kind, label]) => {
              const list = ps.filter((p) => (p.package_type || 'catering') === kind);
              return list.length ? (
                <div key={kind}>
                  {new Set(ps.map((p) => p.package_type || 'catering')).size > 1 && (
                    <h3 className="h3" style={{ margin: '26px 0 12px' }}>
                      {label}
                    </h3>
                  )}
                  <div className="pcards">
                    {list.map((p) => (
                    <div className="pcard" key={p.package_id}>
                      <Link className="ph" to={'/package/' + p.package_id + carry(q)}>
                        {p.package_photos[0] ? <img src={p.package_photos[0].image_url} alt={p.name} /> : 'No photo yet'}
                      </Link>
                      <div className="bd">
                        <span className="tag">{p.package_type === 'food' ? 'Food' : 'Catering'}</span>
                        <h3>
                          <Link to={'/package/' + p.package_id + carry(q)}>{p.name}</Link>
                        </h3>
                        <div className="pr">{priceLabel(p)}</div>
                        <div className="small mut">
                          {guestsLabel(p)}
                          {p.is_customizable ? ' · Customizable' : ''}
                        </div>
                        {p.description && <p className="small mut pdesc">{p.description}</p>}
                        <div className="pgo">
                          <Link className="lnk" to={'/inquire/' + c.caterer_id + '?pkg=' + p.package_id}>
                            Inquire →
                          </Link>
                        </div>
                      </div>
                    </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })
          )}
        </div>
        <aside className="card side-card">
          <h4>Get to know your caterer</h4>
          <div className="kv-l" style={{ marginTop: 0 }}>
            Contact
          </div>
          <div>{c.contact_number}</div>
          {c.email && <div>{c.email}</div>}
          {c.address && (
            <>
              <div className="kv-l">Address</div>
              <div>{c.address}</div>
              {map && (
                <div className="small" style={{ marginTop: 4 }}>
                  <a href={map} target="_blank" rel="noopener noreferrer">
                    Open location in maps
                  </a>{' '}
                  ·{' '}
                  <button type="button" className="lnk small" onClick={() => copyLink(map)}>
                    Copy link
                  </button>
                </div>
              )}
            </>
          )}
          <div className="kv-l">Service area</div>
          <div>{area}</div>
          <div className="kv-l">Event types</div>
          <div>{c.event_types.join(' · ')}</div>
          {(c.note || c.out_of_town) && (
            <>
              <div className="kv-l">Travel note</div>
              <div>{c.note || 'Out-of-town events accepted. Ask about fees.'}</div>
            </>
          )}
          <div className="kv-l">Capacity</div>
          <div>
            {c.min_guests}–{c.max_guests} guests
          </div>
        </aside>
      </div>
      <div id="availability" style={{ marginTop: 44, scrollMarginTop: 90 }}>
        <div style={{ marginTop: 24 }}>
          <Link className="lnk small" to={`/caterer/${c.caterer_id}/gallery`}>
            View gallery and full calendar →
          </Link>
        </div>
      </div>
      <h2 className="sec-t" id="gallery" style={{ scrollMarginTop: 90 }}>
        Reviews &amp; photos
      </h2>
      <Reviews c={c} />
    </div>
  );
}