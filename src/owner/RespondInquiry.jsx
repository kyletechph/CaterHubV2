import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OWNER_STATUSES } from './constants';
import { useAuth } from '../shared/AuthContext';
import { Conversation, buildThread, markInquiryRead } from '../shared/Conversation';
import { useOwner } from './OwnerLayout';
import { Badge, gate, longDate, msg, ok, peso, priceLabel, run, shortDay, useLoad, when } from '../shared/lib';
import { sb } from '../shared/supabase';
export function RespondInquiry() {
  const { ref } = useParams(),
    { c } = useOwner(),
    { me } = useAuth();
  const [st, setSt] = useState('');
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    markInquiryRead(me.id, ref);
  }, [me.id, ref]);
  const s = useLoad(async () => {
    const i = ok(
      await sb
        .from('inquiries')
        .select('*,customers(name),catering_packages(name,price)')
        .eq('ref', ref)
        .eq('caterer_id', c.caterer_id)
        .maybeSingle(),
    );
    if (!i) return null;
    const h = ok(await sb.from('inquiry_status_history').select('*').eq('inquiry_id', i.inquiry_id).order('created_at'));
    const q = await sb.from('inquiry_messages').select('*').eq('inquiry_id', i.inquiry_id).order('created_at');
    const a = await sb.from('caterer_availability').select('status').eq('caterer_id', c.caterer_id).eq('day', i.event_date);
    return { i, h, ms: q.error ? [] : q.data, av: a.error ? null : a.data?.[0]?.status || null };
  }, [ref]);
  const g = gate(s);
  if (g) return g;
  if (!s.data)
    return (
      <div className="card">
        <h3 className="h3">Inquiry not found</h3>
        <p className="mut">Not your record? Return to your inquiries.</p>
        <Link className="btn" to="/owner/inq">
          Back to inquiries
        </Link>
      </div>
    );
  const { i, h, ms, av } = s.data,
    next = st || OWNER_STATUSES.find((x) => x !== i.status) || 'Replied',
    conflict = av === 'Reserved' || av === 'Unavailable',
    outside = next === 'Confirmed Outside System',
    thread = buildThread({ ms, h, meId: me.id, selfRole: 'Caterer', otherName: i.customers?.name || 'Customer' });
  const chat = run(async (e) => {
    const t = e.target.message.value.trim();
    if (!t) throw new Error('Please type your message.');
    const r = await sb.rpc('reply_as_caterer', { p_ref: i.ref, p_message: t });
    if (r.error) {
      if ((r.error.message || '').includes('reply_as_caterer')) throw new Error('Chat is not set up yet. Run supabase/owner/02_chat_with_customer.sql in Supabase.');
      throw r.error;
    }
    e.target.reset();
    msg('Message sent to the customer');
    s.reload();
  });
  const send = run(async (e) => {
    const t = e.target.message.value.trim();
    if ((next === 'Unavailable' || next === 'Cancelled') && !t) throw new Error('A message is required for Unavailable and Cancelled statuses.');
    if (outside && !agree) throw new Error('Confirm that a direct agreement or deposit was received first.');
    const r = await sb.rpc('set_inquiry_status', { p_id: i.inquiry_id, p_status: next, p_message: t });
    if (r.error) throw r.error;
    msg('Response sent. The customer was notified.');
    setSt('');
    setAgree(false);
    e.target.reset();
    s.reload();
  });
  return (
    <>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <h1>Inquiry {i.ref}</h1>
        <Badge s={i.status} />
      </div>
      <p className="sub">Review the event, check your date, and send a clear response.</p>
      {conflict && (
        <div className="warn-b">
          <b>This date is already {av}.</b>
          <span className="small">
            {shortDay(i.event_date)} has an outside-system {av === 'Reserved' ? 'reservation' : 'block'}. Review the calendar before responding. An inquiry does not lock the date.
          </span>
        </div>
      )}
      <div className="resp">
        <div className="stack">
          <div className="card">
            <h3 className="h3">{i.customers?.name || 'Customer'}</h3>
            <p className="tiny mut" style={{ margin: '4px 0 0' }}>
              {i.ref} · Sent {when(i.created_at)}
            </p>
            <div className="kvs">
              {[
                ['Event date', longDate(i.event_date)],
                ['Event type', i.event_type],
                ['Guests', `${i.guests} guests`],
                ['Contact', i.contact_phone],
                ['Location', i.location],
                ['Budget', i.budget || '—'],
              ].map(([l, v]) => (
                <div className="kv" key={l}>
                  <div className="label-s">{l}</div>
                  <b>{v}</b>
                </div>
              ))}
              <div className="kv full">
                <div className="label-s">Package</div>
                <b>
                  {i.catering_packages ? `${i.catering_packages.name} · ${priceLabel(i.catering_packages)}` : 'Custom inquiry'}
                </b>
              </div>
              {i.message && (
                <div className="kv full">
                  <div className="label-s">Special requests</div>
                  <b>{i.message}</b>
                </div>
              )}
              {((i.dietary || []).length > 0 || (i.allergies || []).length > 0) && (
                <div className="kv full">
                  <div className="label-s">Dietary &amp; allergy requests (confirm before quoting)</div>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {[...(i.dietary || []), ...(i.allergies || [])].map((x) => (
                      <span className="chip on" key={x}>
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <Conversation
            title={`Conversation with ${i.customers?.name || 'Customer'}`}
            thread={thread}
            empty="No messages yet. Send a message below, or reply with a status update."
            onSend={chat}
            placeholder="Write a message to your customer…"
            top={0}
          />
          <div className="card hist">
            <h3 className="h3" style={{ marginBottom: 6 }}>
              Status history
            </h3>
            {[...h].reverse().map((x) => (
              <div className="it" key={x.history_id || x.created_at}>
                <h4>
                  {x.previous_status || 'Created'} → {x.status}
                </h4>
                <div className="tiny mut">{when(x.created_at)}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  {x.message || (x.previous_status ? 'Status updated.' : 'Inquiry submitted. No date has been reserved by this inquiry.')}
                </div>
              </div>
            ))}
            <p className="tiny mut" style={{ marginTop: 14 }}>
              Old status, new status, message, author, and time are preserved.
            </p>
          </div>
        </div>
        <div>
          <form className="card" onSubmit={send} key={i.status + h.length}>
            <h3 className="h3" style={{ marginBottom: 20 }}>
              Send a response
            </h3>
            <div className="field">
              <label className="l">New status *</label>
              <select value={next} onChange={(e) => setSt(e.target.value)}>
                {OWNER_STATUSES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <div className="hint">Current status: {i.status}</div>
            </div>
            {outside && (
              <div className="box rust" style={{ padding: '14px 16px', marginBottom: 18 }}>
                <b className="small" style={{ color: 'var(--rust)' }}>
                  Only use this after finalizing directly.
                </b>
                <label className="check small" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Direct agreement or deposit received
                </label>
                <p className="tiny mut" style={{ margin: '8px 0 0' }}>
                  No money is collected by CaterHub. Then mark the calendar date Reserved.
                </p>
              </div>
            )}
            <div className="field">
              <label className="l">Response message {next === 'Unavailable' || next === 'Cancelled' ? '*' : ''}</label>
              <textarea name="message" rows="6" placeholder="Write a clear reply to your customer…" />
              <div className="hint">A message is required for Unavailable and Cancelled statuses.</div>
            </div>
            <button className="btn block">Send &amp; update status</button>
            <p className="tiny mut" style={{ marginTop: 14 }}>
              Your customer will receive an in-app update. The change is added to the status history.
            </p>
          </form>
          <p style={{ marginTop: 18 }}>
            <Link className="lnk small" to="/owner/inq">
              ← Back to inquiries
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
