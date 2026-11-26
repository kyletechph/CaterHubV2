import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Arrow, Bookmark } from '../shared/Icons';
import { COVERS, fromLabel, gate, guestsLabel, isFixed, ok, perGuest, peso, priceLabel, useLoad } from '../shared/lib';
import { COMPARE_MAX, useList } from '../shared/saved';
import { sb } from '../shared/supabase';
import { isVerified } from '../shared/Reviews';
export function Compare() {
  const [ids, toggle] = useList('compare');
  const [saved] = useList('saved');
  const [n, setN] = useState(100);
  const s = useLoad(async () => {
    if (!ids.length) return [];
    return ok(
      await sb
        .from('caterer_profiles')
        .select('*,service_areas(area_name),catering_packages(*,package_photos(image_url))')
        .in('caterer_id', ids)
        .eq('status', 'Published'),
    );
  }, [ids.join(',')]);
  const g = gate(s);
  if (g) return g;
  const rows = ids.map((id) => s.data.find((c) => c.caterer_id === id)).filter(Boolean);
  const guests = Math.max(0, n || 0);
  const info = (c) => {
    const act = c.catering_packages.filter((p) => p.is_active);
    const from = fromLabel(c);
    return { act, from, custom: act.some((p) => p.is_customizable) };
  };
  const first = rows[0] && info(rows[0]);
  const pk = first && first.act.slice().sort((a, b) => perGuest(a) - perGuest(b))[0];
  return (
    <div className="wrap page">
      <div className="crumbs">
        <Link to="/caterers">Browse caterers</Link>
        <i>/</i>
        Compare caterers
      </div>
      <div className="row-between">
        <div>
          <h1 className="h1">Compare your kind of caterer.</h1>
          <p className="sub">A clearer look at what's right for your gathering.</p>
        </div>
        <Link className="btn out sm" to="/saved">
          <Bookmark /> Saved caterers <span className="cnt">{saved.length}</span>
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 28 }}>
          <h3>Nothing to compare yet</h3>
          <p>Pick up to {COMPARE_MAX} caterers with the Compare button on the directory, then come back here.</p>
          <Link className="btn" to="/caterers">
            Browse caterers
          </Link>
        </div>
      ) : (
        <>
          <div className="cmp-top">
            <div>
              <label className="l" style={{ fontSize: 12, fontWeight: 500 }}>
                Estimate for your guest count
              </label>
              <span className="guest-in" style={{ background: '#fff' }}>
                <input type="number" min="1" value={n} onChange={(e) => setN(parseInt(e.target.value) || 0)} />
                <span className="mut">guests</span>
              </span>
            </div>
            <div>
              <b>Starting prices, not a quotation</b>
              <p className="small mut" style={{ margin: '4px 0 0' }}>
                Estimates use directory starting rates. Your chosen package, menu, extras and delivery may change the final
                total.
              </p>
            </div>
            <div className="small mut">
              Dietary requests and allergen handling are not confirmed by either caterer. Ask about ingredients and
              cross-contact before booking.
            </div>
          </div>
          <div className="row-between" style={{ alignItems: 'center', marginBottom: 14 }}>
            <span className="small">
              <span className="cnt" style={{ marginLeft: 0, marginRight: 8 }}>
                {rows.length}
              </span>
              {rows.length} of {COMPARE_MAX} comparison slots filled
            </span>
            {rows.length < COMPARE_MAX && (
              <Link className="btn out sm" to="/caterers">
                + Add another caterer
              </Link>
            )}
          </div>
          <div className="cmp" style={{ '--n': rows.length }}>
            <div className="r">
              <div>
                <h3 className="h3" style={{ marginBottom: 10 }}>
                  The details that matter.
                </h3>
                <p className="small mut">Compare directory and profile information, then confirm the details with each caterer.</p>
                <Link className="lnk small" to="/caterers">
                  ← Back to caterers
                </Link>
              </div>
              {rows.map((c, i) => (
                <div key={c.caterer_id}>
                  <div className="row-between" style={{ alignItems: 'center' }}>
                    <span className="tiny" style={{ color: 'var(--rust)', fontWeight: 600 }}>
                      Selected for comparison
                    </span>
                    <button type="button" className="lnk mut small" onClick={() => toggle(c.caterer_id)}>
                      Remove ×
                    </button>
                  </div>
                  <div className="ph">
                    <img
                      src={c.catering_packages.flatMap((p) => p.package_photos)[0]?.image_url || c.logo || COVERS[i % 3]}
                      alt=""
                    />
                  </div>
                  <h3 className="h3">{c.business_name}</h3>
                  <small>{c.service_areas[0]?.area_name || 'Calbayog City'}</small>
                  <Link className="lnk small" to={'/caterer/' + c.caterer_id} style={{ display: 'inline-block', marginTop: 10 }}>
                    View profile →
                  </Link>
                </div>
              ))}
            </div>
            <div className="r">
              <div>Starting price</div>
              {rows.map((c) => {
                const { from } = info(c);
                return (
                  <div key={c.caterer_id}>
                    <b className="big">{from || 'On request'}</b>
                    <small>Directory starting price; varies by package.</small>
                  </div>
                );
              })}
            </div>
            <div className="r">
              <div>Guest capacity</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  {c.min_guests}–{c.max_guests} guests
                </div>
              ))}
            </div>
            <div className="r">
              <div className="hl">Starting estimate · {guests} guests</div>
              {rows.map((c) => {
                const { from } = info(c);
                return (
                  <div className="hl" key={c.caterer_id}>
                    <b className="big">{from ? `From ${peso(from * guests)}` : '—'}</b>
                    <small>{from ? `${peso(from)} × ${guests} guests · not a final quote.` : 'Ask the caterer for a quote.'}</small>
                  </div>
                );
              })}
            </div>
            <div className="r">
              <div>Menu approach</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  {info(c).custom ? 'Customizable packages' : 'Set packages'}
                  <small>{c.tagline || 'Menu details: confirm with caterer.'}</small>
                </div>
              ))}
            </div>
            <div className="r">
              <div>Inclusions</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  Depends on your chosen package
                  <small>Ask what setup, staff and equipment are included.</small>
                </div>
              ))}
            </div>
            <div className="r">
              <div>Service area</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  {c.service_areas.map((a) => a.area_name).join(', ') || 'Calbayog City'}
                  <small>{c.note || 'Travel and delivery fees: confirm with caterer.'}</small>
                </div>
              ))}
            </div>
            <div className="r">
              <div>Dietary confirmation</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  <span className="red">Not yet confirmed</span>
                  <small>Confirm dietary requests and allergen handling.</small>
                </div>
              ))}
            </div>
            <div className="r">
              <div>Verification</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  {isVerified(c) ? 'Verified (automatic check)' : 'Not verified yet'}
                </div>
              ))}
            </div>
            <div className="r">
              <div>Ready to ask a few questions?</div>
              {rows.map((c) => (
                <div key={c.caterer_id}>
                  <Link className="btn block" to={`/inquire/${c.caterer_id}?guests=${guests || ''}`}>
                    Send inquiry <Arrow />
                  </Link>
                </div>
              ))}
            </div>
          </div>
          <div className="two" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', marginTop: 28 }}>
            {pk && (
              <div className="box sage" style={{ padding: 28 }}>
                <div className="label-s" style={{ color: 'var(--sage-ink)' }}>
                  A specific package, not the starting price
                </div>
                <h3 className="h3" style={{ margin: '10px 0 6px' }}>
                  {rows[0].business_name} · {pk.name}
                </h3>
                <b>
                  {priceLabel(pk)} · {guestsLabel(pk)}
                </b>
                <p className="small mut" style={{ margin: '12px 0' }}>
                  {pk.description ? `${pk.description} ` : ''}Tables and chairs: {pk.tables_chairs || 'ask the caterer'}.
                </p>
                <p className="tiny mut">
                  {isFixed(pk)
                    ? `Package price: ${peso(pk.price)} for up to ${pk.max_guests} guests.`
                    : `At ${guests} guests: ${peso(pk.price)} × ${guests} = ${peso(pk.price * guests)} base total.`}{' '}
                  Menu changes and optional extras may affect the final quotation.
                </p>
                <Link className="lnk small" to={'/package/' + pk.package_id}>
                  View package →
                </Link>
              </div>
            )}
            <div>
              <h4 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>A comparison is a starting point.</h4>
              <p className="small mut">
                Confirm your menu, inclusions, dietary requests, allergen handling and final quote directly with the caterer.
                Availability is not a reservation.
              </p>
              <p className="small mut">Photos show presentation style, not verified customer evidence. No ratings or verification badges are assumed.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
