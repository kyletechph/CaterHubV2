import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOwner } from './OwnerLayout';
import { gate, guestsLabel, msg, ok, peso, priceLabel, run, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
export function Packages() {
  const { c } = useOwner();
  const [tab, setTab] = useState('Active');
  const [kind, setKind] = useState('all');
  const s = useLoad(
    async () =>
      ok(
        await sb
          .from('catering_packages')
          .select('*,package_photos(image_url)')
          .eq('caterer_id', c.caterer_id)
          .order('package_id'),
      ),
    [c.caterer_id],
  );
  const g = gate(s);
  if (g) return g;
  const all = s.data,
    act = all.filter((p) => p.is_active),
    off = all.filter((p) => !p.is_active),
    rows = (tab === 'Active' ? act : off).filter((p) => kind === 'all' || (p.package_type || 'catering') === kind);
  const flip = (p) =>
    run(async () => {
      const r = await sb.from('catering_packages').update({ is_active: !p.is_active }).eq('package_id', p.package_id);
      if (r.error) throw r.error;
      msg(p.is_active ? 'Package deactivated. It is no longer visible publicly.' : 'Package is active again.');
      s.reload();
    });
  return (
    <>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <div>
          <h1>Packages</h1>
          <p className="sub">Thoughtful menus, clearly presented.</p>
        </div>
        <Link className="btn" to="/owner/pk/new">
          + Add package
        </Link>
      </div>
      <div className="tabs bare">
        <button className={tab === 'Active' ? 'on' : ''} onClick={() => setTab('Active')}>
          Active {act.length}
        </button>
        <button className={tab === 'Inactive' ? 'on' : ''} onClick={() => setTab('Inactive')}>
          Inactive {off.length}
        </button>
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {[['all', 'All'], ['catering', 'Catering'], ['food', 'Food']].map(([v, l]) => (
          <button key={v} type="button" className={'chip' + (kind === v ? ' on' : '')} onClick={() => setKind(v)}>
            {l}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>{all.length ? `No ${tab.toLowerCase()} packages` : 'No packages yet'}</h3>
          <p>{all.length ? 'Switch tabs to see your other packages.' : 'Add your first menu so customers can see what you offer.'}</p>
          {!all.length && (
            <Link className="btn" to="/owner/pk/new">
              + Add package
            </Link>
          )}
        </div>
      ) : (
        <div className="pcards">
          {rows.map((p) => (
            <div className="pcard" key={p.package_id}>
              <div className="ph">{p.package_photos[0] ? <img src={p.package_photos[0].image_url} alt="" /> : 'No photo yet'}</div>
              <div className="bd">
                <span className={'badge s-' + (p.is_active ? 'Active' : 'Inactive')}>{p.is_active ? 'Active' : 'Inactive'}</span>{' '}
                <span className="tag">{p.package_type === 'food' ? 'Food' : 'Catering'}</span>
                <h3>{p.name}</h3>
                <div className="pr">{priceLabel(p)}</div>
                <div className="small mut">
                  {guestsLabel(p)}
                  {p.is_customizable ? ' · Customizable' : ''}
                </div>
                {((p.inclusions || []).join(' · ') || p.description) && (
                  <p className="small mut" style={{ margin: '8px 0 0' }}>
                    {(p.inclusions || []).join(' · ') || p.description}
                  </p>
                )}
              </div>
              <div className="acts">
                <Link className="btn sm" to={'/owner/pk/' + p.package_id}>
                  Edit package
                </Link>
                <button className="btn soft sm" onClick={flip(p)}>
                  {p.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="tiny mut" style={{ marginTop: 18 }}>
        Only active packages are visible publicly. Deactivating a package keeps its existing inquiry records.
      </p>
    </>
  );
}
