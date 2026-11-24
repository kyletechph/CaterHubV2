import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOwner } from './OwnerLayout';
import { Badge, gate, longDate, msg, ok, run, today, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
export function Availability() {
  const { c } = useOwner();
  const [m, setM] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [pick, setPick] = useState(today());
  const [st, setSt] = useState(null);
  const s = useLoad(async () => {
    const a = ok(await sb.from('caterer_availability').select('day,status').eq('caterer_id', c.caterer_id));
    const inq = ok(await sb.from('inquiries').select('inquiry_id,ref,status,event_date,customers(name)').eq('caterer_id', c.caterer_id));
    const nq = await sb.from('caterer_day_notes').select('day,note').eq('caterer_id', c.caterer_id);
    return {
      av: Object.fromEntries(a.map((x) => [x.day, x.status])),
      inq: inq.filter((i) => i.status !== 'Cancelled'),
      notes: nq.error ? null : Object.fromEntries(nq.data.map((x) => [x.day, x.note])),
    };
  }, [c.caterer_id]);
  const g = gate(s);
  if (g) return g;
  const { av, inq, notes } = s.data,
    y = m.getFullYear(),
    mo = m.getMonth(),
    n = new Date(y, mo + 1, 0).getDate(),
    f = new Date(y, mo, 1).getDay(),
    key = (d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    byDay = {};
  inq.forEach((i) => (byDay[i.event_date] = [...(byDay[i.event_date] || []), i]));
  const cur = st ?? av[pick] ?? 'Available',
    pend = (byDay[pick] || []).filter((i) => i.status === 'Pending');
  const choose = (k) => {
    setPick(k);
    setSt(null);
  };
  const save = run(async (e) => {
    const note = e.target.note.value.trim();
    let r;
    if (cur === 'Available') r = await sb.from('caterer_availability').delete().eq('caterer_id', c.caterer_id).eq('day', pick);
    else r = await sb.from('caterer_availability').upsert({ caterer_id: c.caterer_id, day: pick, status: cur });
    if (r.error) throw r.error;
    if (notes) {
      const nr = note
        ? await sb.from('caterer_day_notes').upsert({ caterer_id: c.caterer_id, day: pick, note })
        : await sb.from('caterer_day_notes').delete().eq('caterer_id', c.caterer_id).eq('day', pick);
      if (nr.error) throw nr.error;
    } else if (note) msg('Date saved. Private notes need the database update (supabase/setup/2_safe_update.sql).', 1);
    msg('Date saved');
    setSt(null);
    s.reload();
  });
  return (
    <>
      <h1>Availability calendar</h1>
      <p className="sub">Keep your dates up to date. An inquiry never reserves a date.</p>
      <div className="two" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', marginTop: 26 }}>
        <div className="card calcard">
          <div className="cal-h">
            <h3>{m.toLocaleString('en', { month: 'long', year: 'numeric' })}</h3>
            <div className="nv">
              <button onClick={() => setM(new Date(y, mo - 1, 1))} aria-label="Previous month">
                ‹
              </button>
              <button onClick={() => setM(new Date(y, mo + 1, 1))} aria-label="Next month">
                ›
              </button>
            </div>
          </div>
          <div className="cal7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div className="wd" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: f }, (_, i) => (
              <div className="cd blank" key={'e' + i} />
            ))}
            {Array.from({ length: n }, (_, i) => {
              const d = i + 1,
                k = key(d),
                di = byDay[k] || [];
              return (
                <button key={d} type="button" className={`cd ${av[k] || ''} ${pick === k ? 'sel' : ''}`} onClick={() => choose(k)}>
                  {d}
                  <small>{av[k] || 'Available'}</small>
                  {di.length > 0 && (
                    <small className="inq">
                      {di.length} {di.length === 1 ? 'inquiry' : 'inquiries'}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span>
              <i />
              Available
            </span>
            <span>
              <i className="u" />
              Unavailable
            </span>
            <span>
              <i className="r" />
              Reserved
            </span>
            <span>
              <i className="p" />
              Pending inquiry
            </span>
          </div>
        </div>
        <form className="card" onSubmit={save} key={pick + (av[pick] || '') + (notes?.[pick] || '')}>
          <h3 className="h3" style={{ marginBottom: 12 }}>
            {longDate(pick)}
          </h3>
          <Badge s={av[pick] || 'Available'} />
          <div className="field" style={{ marginTop: 22 }}>
            <label className="l">Set availability</label>
            <select value={cur} onChange={(e) => setSt(e.target.value)}>
              {['Available', 'Unavailable', 'Reserved'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="l">Private calendar note</label>
            <textarea name="note" rows="3" defaultValue={notes?.[pick] || ''} placeholder="Outside-system agreement confirmed. Do not share deposit details publicly." />
            <div className="hint">Reserved dates must follow a direct agreement or outside-system deposit.</div>
          </div>
          <button className="btn block">Save date</button>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0 16px' }} />
          <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Pending for this date</h4>
          {pend.length === 0 && <p className="tiny mut">No pending inquiries on this date.</p>}
          {pend.map((i) => (
            <div key={i.inquiry_id} className="small">
              {i.ref} · {i.customers?.name}
              <br />
              <Link className="lnk small" to={'/owner/inq/' + i.ref}>
                Review inquiry →
              </Link>
            </div>
          ))}
        </form>
      </div>
      <div className="box sage" style={{ marginTop: 24, padding: '24px 28px' }}>
        <h3 className="h3" style={{ marginBottom: 8, fontSize: 18 }}>
          You're in control of your calendar.
        </h3>
        <p className="small mut" style={{ margin: 0 }}>
          Mark dates Available, Unavailable, or Reserved. Pending inquiry markers are separate from availability. Confirming an inquiry outside the system does not automatically reserve a date—update this calendar too.
        </p>
      </div>
    </>
  );
}
