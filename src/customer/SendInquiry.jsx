import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../shared/AuthContext';
import { AvailCalendar, BLOCKED, useAvail } from '../shared/AvailCalendar';
import { Arrow } from '../shared/Icons';
import { Empty, gate, guestsLabel, isFixed, msg, ok, peso, priceLabel, shortDay, today, totalFor, useLoad } from '../shared/lib';
import { sb } from '../shared/supabase';
export function Inquire() {
  const { id } = useParams(),
    [sp] = useSearchParams(),
    { me } = useAuth(),
    nav = useNavigate();
  const s = useLoad(
    async () => ok(await sb.from('caterer_profiles').select('*,catering_packages(*)').eq('caterer_id', id).maybeSingle()),
    [id],
  );
  const [pkg, setPkg] = useState(null);
  const [date, setDate] = useState(sp.get('date') || '');
  const [guests, setGuests] = useState(sp.get('guests') || '');
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const av = useAvail(id);
  const g = gate(s);
  if (g) return g;
  const c = s.data;
  if (!c || c.status !== 'Published')
    return (
      <Empty>
        <h3 className="h3">Caterer not found</h3>
        <p className="mut">This caterer is not accepting inquiries right now.</p>
        <Link className="btn" to="/caterers">
          Browse caterers
        </Link>
      </Empty>
    );
  const ps = c.catering_packages.filter((p) => p.is_active),
    sel = pkg ?? (sp.get('pkg') || ''),
    p = ps.find((x) => String(x.package_id) === sel),
    ev = c.event_types,
    n = parseInt(guests) || 0,
    st = date ? av.data?.map?.[date] : null,
    taken = BLOCKED.includes(st);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const f = Object.fromEntries(new FormData(e.target)),
      list = [],
      evType = (f.event_type || '').trim();
    if (!f.event_date) list.push('Event date: choose today or a future date.');
    else if (f.event_date < today()) list.push('Event date: past dates are not accepted.');
    else if (BLOCKED.includes(av.data?.map?.[f.event_date]))
      list.push(`Event date: ${shortDay(f.event_date)} is already ${av.data.map[f.event_date]}. Please choose another date.`);
    if (!evType) list.push('Event type: type or pick what kind of event this is.');
    if (!f.location.trim()) list.push('Event location: enter your event venue.');
    if (!(n >= 1)) list.push('Guests: enter a positive whole number.');
    else if (p && (n < p.min_guests || n > p.max_guests)) list.push(`Guests: this package fits ${p.min_guests}–${p.max_guests} guests.`);
    setErrs(list);
    if (list.length) return window.scrollTo({ top: 0, behavior: 'smooth' });
    setBusy(true);
    try {
      const cu = ok(await sb.from('customers').select('customer_id').eq('user_id', me.id).maybeSingle());
      if (!cu) throw new Error('Customer profile not found.');
      const row = {
        customer_id: cu.customer_id,
        caterer_id: +id,
        package_id: p ? p.package_id : null,
        event_date: f.event_date,
        event_type: evType,
        location: f.location.trim(),
        guests: n,
        contact_phone: f.contact_phone.trim(),
        budget: f.budget.trim(),
        message: f.message.trim(),
      };
      const r = await sb.from('inquiries').insert(row).select('ref').single();
      if (r.error) throw r.error;
      nav('/inquire/sent/' + r.data.ref);
    } catch (x) {
      msg(x.message?.includes('not available') ? x.message : "Your inquiry wasn't sent. " + (x.message || 'Please try again.'), 1);
      setBusy(false);
    }
  };
  return (
    <div className="wrap page">
      <div className="crumbs">
        <Link to={'/caterer/' + id}>{c.business_name}</Link>
        <i>/</i>
        Send an inquiry
      </div>
      <h1 className="h1" style={{ fontSize: 38 }}>
        Tell us about your gathering.
      </h1>
      <p className="sub">Share the details once. Your caterer will check your date and reply.</p>
      {errs.length > 0 && (
        <div className="warn-b" role="alert" style={{ marginTop: 22 }}>
          <b>Please check your event details</b>
          {errs.map((x) => (
            <div key={x} className="small">
              {x}
            </div>
          ))}
        </div>
      )}
      <div className="inq" style={{ marginTop: 28 }}>
        <form className="card" onSubmit={submit} noValidate>
          <div className="row-between" style={{ alignItems: 'center', marginBottom: 22 }}>
            <h3 className="h3">Event details</h3>
            <span className="tiny mut">* Required fields</span>
          </div>
          <div className="fgrid">
            <div className="field">
              <label className="l">Event date *</label>
              <input type="date" name="event_date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="l">Event type *</label>
              <input name="event_type" list="inq-events" placeholder="Type or pick an event" autoComplete="off" maxLength={60} defaultValue={sp.get('event') || ''} />
              <datalist id="inq-events">
                {ev.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
            <div className="field full">
              <label className="l">Event location *</label>
              <input name="location" placeholder="Venue, street, barangay, city" />
            </div>
            <div className="field">
              <label className="l">Number of guests *</label>
              <input type="number" name="guests" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div className="field">
              <label className="l">Contact number *</label>
              <input type="tel" name="contact_phone" placeholder="09xx xxx xxxx" required defaultValue="" />
            </div>
            <div className="field full">
              <label className="l">Package or custom inquiry *</label>
              <select value={sel} onChange={(e) => setPkg(e.target.value)}>
                {ps.map((x) => (
                  <option key={x.package_id} value={x.package_id}>
                    {x.name} · {priceLabel(x)}
                  </option>
                ))}
                <option value="">Custom inquiry</option>
              </select>
              <div className="hint">Choose "Custom inquiry" if you haven't selected a package.</div>
            </div>
            <div className="field full">
              <label className="l">Estimated total budget (optional)</label>
              <input name="budget" placeholder="e.g. ₱35,000" defaultValue={p && n ? peso(totalFor(p, n)) : ''} key={(p?.package_id || 'c') + n} />
            </div>
            <div className="field full">
              <label className="l">Special requests (optional)</label>
              <textarea name="message" rows="4" placeholder="Tell us about menu preferences, setup, or dietary needs." />
            </div>
          </div>
          <p className="tiny mut">Your contact details are shared only with this caterer.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <button className="btn" style={{ padding: '14px 28px' }} disabled={busy}>
              {busy ? 'Sending…' : <>Send inquiry <Arrow /></>}
            </button>
            <Link className="lnk mut" to={'/caterer/' + id}>
              Cancel
            </Link>
          </div>
          {busy && <p className="tiny mut" style={{ marginTop: 10 }}>Please wait. Don't submit again.</p>}
        </form>
        <aside>
          <div className="card summary-box">
            <h3 className="h3">Your inquiry</h3>
            <h4 style={{ fontSize: 17, fontWeight: 600, margin: '22px 0 4px' }}>{c.business_name}</h4>
            <p className="mut small">{p ? p.name : 'Custom inquiry'}</p>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
            {p ? (
              <>
                <p className="small">
                  {isFixed(p) ? `${peso(p.price)} / package · ${guestsLabel(p).toLowerCase()}` : `${peso(p.price)} / guest × ${n || 0} guests`}
                </p>
                <div className="big">{peso(totalFor(p, n))}</div>
                <p className="tiny mut">Estimated base total · excludes extras</p>
              </>
            ) : (
              <p className="small mut">The caterer will send a quotation for your custom request.</p>
            )}
            {date && (
              <div className={'okbox' + (taken ? ' bad' : '')} style={{ marginTop: 18 }}>
                <b style={{ display: 'block' }}>
                  {shortDay(date)}: {taken ? st : 'Available for inquiry'}
                </b>
                {taken ? 'Please choose another date.' : 'Your date is not reserved yet.'}
              </div>
            )}
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 10px' }}>What happens next?</h4>
            <ol className="small mut" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
              <li>The caterer reviews your event details.</li>
              <li>You receive an in-app status update.</li>
              <li>Finalize quotes and deposits directly.</li>
            </ol>
            <p className="tiny mut" style={{ marginTop: 20 }}>
              Estimate, not a final quote. Optional extras are quoted separately.
            </p>
            <details style={{ marginTop: 14 }}>
              <summary className="lnk small">Check the caterer's calendar</summary>
              <div style={{ marginTop: 14 }}>
                {av.data ? <AvailCalendar avail={av.data} value={date} onPick={setDate} /> : <p className="mut small">Loading…</p>}
              </div>
            </details>
          </div>
          <p className="tiny mut" style={{ marginTop: 14 }}>
            Sending an inquiry does not create a booking, contract, or payment.
          </p>
        </aside>
      </div>
    </div>
  );
}
