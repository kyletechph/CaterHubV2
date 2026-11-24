import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { fmt, gate, msg, ok, run, useLoad } from './lib';
import { sb } from './supabase';
// Turn the stored one-line message into a title and a short description
export function shape(m) {
  return tidy(shape0(m));
}
function shape0(m) {
  const ref = (m.match(/INQ-\d+/) || [])[0];
  let r;
  if ((r = m.match(/^(.*?) updated (INQ-\d+) to "([^"]+)"(?:: (.*?))?\.?$/)))
    return { ref, title: `${r[1]} updated the status to ${r[3]}`, body: [r[2], r[4]].filter(Boolean).join(' · ') };
  if ((r = m.match(/^Your inquiry (INQ-\d+) was sent to (.*?)\. (.*)$/)))
    return { ref, title: `Your inquiry was sent to ${r[2]}.`, body: `${r[1]} · ${r[3]}` };
  if ((r = m.match(/^New inquiry (INQ-\d+) from (.*?) for (.*?)\.?$/)))
    return { ref, title: `New inquiry from ${r[2]}`, body: `${r[1]} · ${r[3]}` };
  if ((r = m.match(/^(.*?) replied on (INQ-\d+): (.*)$/)))
    return { ref, title: `${r[1]} replied to your inquiry`, body: `${r[2]} · ${r[3]}` };
  return { ref, title: m, body: '' };
}
const tidy = (r) => ({ ...r, title: r.title.replace(/\.{2,}$/, '.') });
export function NotesBody({ owner = false }) {
  const { me } = useAuth();
  const [picked, setPicked] = useState(new Set());
  const [tab, setTab] = useState('all');
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState('');
  const s = useLoad(
    async () => ok(await sb.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(100)),
    [],
  );
  const g = gate(s);
  if (g) return g;
  const all = s.data,
    unread = all.filter((n) => !n.is_read),
    list = tab === 'unread' ? unread : all,
    allPicked = list.length > 0 && list.every((n) => picked.has(n.notification_id));
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const changed = () => window.dispatchEvent(new Event('caterhub:notes'));
  const markAll = run(async () => {
    if (!unread.length) return;
    const r = await sb.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false);
    if (r.error) throw r.error;
    s.reload();
    changed();
  });
  const clear = run(async () => {
    if (!picked.size) throw new Error('Select at least one notification to clear.');
    const r = await sb
      .from('notifications')
      .delete()
      .in('notification_id', [...picked])
      .eq('user_id', me.id)
      .select('notification_id');
    if (r.error) throw r.error;
    if (!r.data.length) throw new Error('Could not clear. Run supabase/setup/2_safe_update.sql in Supabase first.');
    setPicked(new Set());
    s.reload();
    changed();
    msg('Notifications cleared');
  });
  const open = (n) => {
    if (!n.is_read) sb.from('notifications').update({ is_read: true }).eq('notification_id', n.notification_id).then(() => {
      s.reload();
      changed();
    });
  };
  const send = (ref) =>
    run(async () => {
      const t = text.trim();
      if (!t) throw new Error('Please type your reply.');
      const r = await sb.rpc('reply_to_inquiry', { p_ref: ref, p_message: t });
      if (r.error) {
        if ((r.error.message || '').includes('reply_to_inquiry')) throw new Error('Replying is not set up yet. Run supabase/setup/2_safe_update.sql in Supabase.');
        throw r.error;
      }
      msg('Reply sent to the caterer');
      setReplyTo(null);
      setText('');
    });
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="nbar">
        <button className={'seg' + (tab === 'all' ? ' on' : '')} onClick={() => setTab('all')}>
          All {all.length}
        </button>
        <button className={'seg' + (tab === 'unread' ? ' on' : '')} onClick={() => setTab('unread')}>
          Unread {unread.length}
        </button>
        <span className="sp" />
        <button className="tx r" onClick={markAll} disabled={!unread.length}>
          Mark all as read
        </button>
        <button className="tx" onClick={() => setPicked(allPicked ? new Set() : new Set(list.map((n) => n.notification_id)))}>
          {allPicked ? 'Unselect all' : 'Select all'}
        </button>
        <button className="tx" onClick={clear} disabled={!picked.size}>
          Clear{picked.size ? ` (${picked.size})` : ''}
        </button>
      </div>
      {list.length === 0 && (
        <div className="empty-state" style={{ boxShadow: 'none' }}>
          <h3>You're all caught up</h3>
          <p>{tab === 'unread' ? 'No unread notifications.' : owner ? 'New inquiries and status updates will show here.' : 'Replies from caterers will show here.'}</p>
        </div>
      )}
      {list.map((n) => {
        const { ref, title, body } = shape(n.message);
        const canReply = !owner && ref && !/^Your inquiry/.test(n.message) && !n.message.includes(' replied on ');
        return (
          <div className={'nitem' + (n.is_read ? '' : ' unread')} key={n.notification_id}>
            <input type="checkbox" checked={picked.has(n.notification_id)} onChange={() => toggle(n.notification_id)} aria-label="Select notification" />
            <div onClick={() => open(n)}>
              <h4>{title}</h4>
              {body && <p>{body}</p>}
              <div className="when">{fmt(n.created_at)}</div>
              <div className="nactions">
              {owner && ref && /^New inquiry|replied on/.test(n.message) && (
                <Link className="btn out sm nreply" to={'/owner/inq/' + ref}>
                  Reply to customer
                </Link>
              )}
              {!owner && ref && (
                <Link className="btn out sm nreply" to={'/my/' + ref} onClick={(e) => e.stopPropagation()}>
                  Open conversation
                </Link>
              )}
              {canReply &&
                (replyTo === n.notification_id ? (
                  <div className="nreply" onClick={(e) => e.stopPropagation()}>
                    <textarea rows="3" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to the caterer about ${ref}...`} />
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="button" className="btn sm" onClick={send(ref)}>
                        Send reply
                      </button>
                      <button
                        type="button"
                        className="btn soft sm"
                        onClick={() => {
                          setReplyTo(null);
                          setText('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn out sm nreply"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyTo(n.notification_id);
                      setText('');
                    }}
                  >
                    Reply to caterer
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
