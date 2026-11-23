import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../shared/AuthContext';
import { Arrow } from '../shared/Icons';
import { Empty, gate, guestsLabel, isFixed, ok, peso, totalFor, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
export function Pkg() {
  const { id } = useParams(),
    { me } = useAuth();
  const [sp] = useSearchParams();
  const [n, setN] = useState(parseInt(sp.get('guests')) || 100);
  const s = useLoad(
    async () =>
      ok(
        await sb
          .from('catering_packages')
          .select('*,caterer_profiles(caterer_id,business_name,service_areas(area_name)),package_menu_items(*),package_photos(image_url)')
          .eq('package_id', id)
          .maybeSingle(),
      ),
    [id],
  );
  const g = gate(s);
  if (g) return g;
  const p = s.data;
  if (!p) return <Empty>Package not found.</Empty>;
  const c = p.caterer_profiles,
    guests = Math.max(0, n || 0),
    total = totalFor(p, guests),
    area = (c.service_areas || []).map((a) => a.area_name).join(', ') || 'Calbayog City',
    food = p.package_type === 'food',
    extras = !food && p.tables_chairs && p.tables_chairs !== 'Included';
  const inquire = `/inquire/${c.caterer_id}?pkg=${p.package_id}&guests=${isFixed(p) ? p.max_guests : guests || ''}`;
  return (
    <div className="wrap page">
      <div className="crumbs">
        <Link to="/caterers">Browse caterers</Link>
        <i>/</i>
        <Link to={'/caterer/' + c.caterer_id}>{c.business_name}</Link>
        <i>/</i>
        {p.name}
      </div>
      <h1 className="h1" style={{ fontSize: 40 }}>
        {p.name}
      </h1>
      <p className="sub">Package by {c.business_name}</p>
      <div className="pkd" style={{ marginTop: 26 }}>
        <div>
          <div className="pic">{p.package_photos[0] ? <img src={p.package_photos[0].image_url} alt="" /> : null}</div>
          <h2 className="h2" style={{ fontSize: 24, margin: '44px 0 12px' }}>
            A celebration, thoughtfully served.
          </h2>
          <p className="mut" style={{ maxWidth: 560 }}>
            {p.description ? `${p.description} ` : ''}Discuss your preferred dishes{food ? '' : ', styling, and serving requirements'} with {c.business_name} before
            finalizing your event.
          </p>
          <h2 className="h2" style={{ fontSize: 24, margin: '40px 0 14px' }}>
            Menu
          </h2>
          {p.package_menu_items.length === 0 && <p className="mut small">The caterer has not listed a menu yet.</p>}
          {[...new Set(p.package_menu_items.map((m) => m.category))].map((cat) => {
            const items = p.package_menu_items.filter((m) => m.category === cat),
              pick = items[0].quantity;
            return (
              <div className="mrow" key={cat}>
                <div className="label-s">
                  {cat}
                  {pick ? ` · choose ${pick}` : ''}
                </div>
                {items.map((m) => m.item_name).join(' · ')}
              </div>
            );
          })}
          <h2 className="h2" style={{ fontSize: 24, margin: '40px 0 12px' }}>
            What's included
          </h2>
          <p className="mut small">{(p.inclusions || []).join('  ·  ') || 'Ask the caterer what is included.'}</p>
          <p className="mut small" style={{ marginTop: 4 }}>
            {food ? '' : `Tables and chairs: ${p.tables_chairs || 'ask the caterer'}. `}Menu changes may affect your final quotation.
          </p>
        </div>
        <div>
          <div className="card" style={{ padding: 28 }}>
            <span className="pill" style={{ marginRight: 6 }}>{food ? 'Food package' : 'Catering package'}</span>
            {p.is_customizable && <span className="pill rust">Customizable</span>}
            <div className="price-big">{peso(p.price)}</div>
            <div className="mut small">
              {isFixed(p) ? 'per package' : 'per guest'} · {p.price_range || 'indicative pricing'}
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0' }} />
            <b style={{ fontSize: 17, fontWeight: 600 }}>{guestsLabel(p)}</b>
            <p className="mut small" style={{ margin: '16px 0 8px' }}>
              Service area: {area}
            </p>
            {!food && <p className="mut small">Tables &amp; chairs: {p.tables_chairs || '—'}</p>}
            <b className="small" style={{ display: 'block', margin: '20px 0 8px' }}>
              Estimate · not a final quote
            </b>
            {!isFixed(p) && (
              <div className="est-row">
                <span className="mut">Guest count</span>
                <span className="guest-in">
                  <input type="number" min="1" value={n} onChange={(e) => setN(parseInt(e.target.value) || 0)} aria-label="Guest count" />
                  <span>guests</span>
                </span>
              </div>
            )}
            <div className="est-row">
              <span className="mut">{isFixed(p) ? 'Package price' : 'Base total'}</span>
              <b>{peso(total)}</b>
            </div>
            {isFixed(p) && <p className="tiny mut">Good for up to {p.max_guests} guests. Ask the caterer if you have more guests.</p>}
            {extras && (
              <div className="box rust" style={{ padding: '12px 14px', margin: '12px 0' }}>
                <b className="small" style={{ color: 'var(--rust)' }}>
                  Optional extras
                </b>
                <div className="small mut">Tables and chairs: quoted by caterer</div>
              </div>
            )}
            <b className="small" style={{ display: 'block', marginTop: 12 }}>
              Final total
            </b>
            <p className="tiny mut" style={{ marginBottom: 20 }}>
              Confirmed by caterer after menu changes and optional extras.
            </p>
            <Link className="btn block" to={inquire}>
              Inquire about this package <Arrow />
            </Link>
            <b className="small" style={{ display: 'block', margin: '22px 0 6px' }}>
              Have a different menu in mind?
            </b>
            <Link className="lnk small" to={`/inquire/${c.caterer_id}`}>
              Send a custom inquiry
            </Link>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '20px 0' }} />
            <p className="tiny mut" style={{ margin: 0 }}>
              No payment is collected here. Final quotes, deposits, and agreements happen directly with your caterer.
            </p>
          </div>
          {!me && (
            <div className="box sage" style={{ marginTop: 18, padding: 26 }}>
              <h3 className="h3" style={{ marginBottom: 10 }}>
                Just browsing?
              </h3>
              <p className="mut small">Guests can view packages. Log in or create a customer account to send an inquiry.</p>
              <Link className="lnk small" to="/login" state={{ from: inquire }}>
                Log in to inquire →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
