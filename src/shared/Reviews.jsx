import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { sb } from './supabase';
import { msg, run, upload } from './lib';

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z';

export const Stars = ({ value = 0, size = 18 }) => (
  <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <svg key={n} width={size} height={size} viewBox="0 0 24 24" className={n <= Math.round(value) ? 'on' : ''} aria-hidden="true">
        <path d={STAR} />
      </svg>
    ))}
  </span>
);

// small seal with a check, shown next to the name of a verified caterer
export const VerifiedBadge = ({ size = 22 }) => (
  <span className="vbadge" title="Verified business" role="img" aria-label="Verified business">
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12 1.8l2.4 1.7 2.9-.1 1 2.8 2.4 1.7-.9 2.8.9 2.8-2.4 1.7-1 2.8-2.9-.1L12 22.2l-2.4-1.7-2.9.1-1-2.8-2.4-1.7.9-2.8-.9-2.8 2.4-1.7 1-2.8 2.9.1z"
      />
      <path d="M8.2 12.2l2.6 2.6 5-5.3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const WORDS = ['', 'Very dissatisfied', 'Dissatisfied', 'Okay', 'Satisfied', 'Very satisfied'];

function StarInput({ value, onChange, size = 34, label = 'Your rating' }) {
  return (
    <div className="stars big" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}>
          <svg width={size} height={size} viewBox="0 0 24 24" className={n <= value ? 'on' : ''} aria-hidden="true">
            <path d={STAR} />
          </svg>
        </button>
      ))}
    </div>
  );
}

const when = (d) => new Date(d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

export function Reviews({ c }) {
  const { me } = useAuth();
  const id = c.caterer_id;
  const [rows, setRows] = useState(null);
  const [n, setN] = useState(0);
  const [lastEvent, setLastEvent] = useState(null); // null = this customer never sent an inquiry here
  const [rating, setRating] = useState(0);
  const [asp, setAsp] = useState({ food: 0, service: 0, value: 0 });
  const [files, setFiles] = useState([]);

  useEffect(() => {
    let live = true;
    sb.from('reviews')
      .select('*')
      .eq('caterer_id', id)
      .order('created_at', { ascending: false })
      .then((r) => live && setRows(r.error ? [] : r.data));
    return () => {
      live = false;
    };
  }, [id, n]);

  useEffect(() => {
    if (me?.role !== 'Customer') return setLastEvent(null);
    let live = true;
    sb.from('inquiries')
      .select('event_type')
      .eq('caterer_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then((r) => live && setLastEvent(r.error || !r.data.length ? null : r.data[0].event_type || ''));
    return () => {
      live = false;
    };
  }, [id, me?.id, me?.role]);

  if (!rows) return <p className="mut small">Loading reviews…</p>;
  const mine = me && rows.find((r) => r.user_id === me.id),
    avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0,
    canWrite = me?.role === 'Customer' && lastEvent !== null && !mine;

  const pick = (e) => {
    const list = [...e.target.files].slice(0, 3);
    if (list.some((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) return msg('Only JPG, PNG or WebP photos are allowed.', 1);
    if (list.some((f) => f.size > 2 * 1048576)) return msg('Each photo must be 2 MB or smaller.', 1);
    setFiles(list);
  };
  const submit = run(async (e) => {
    if (!rating) throw new Error('Tap the stars to give a rating first.');
    const f = new FormData(e.target);
    const photos = [];
    for (const file of files) photos.push(await upload(file, me.id));
    const r = await sb.from('reviews').insert({
      caterer_id: id,
      user_id: me.id,
      rating,
      food_rating: asp.food || null,
      service_rating: asp.service || null,
      value_rating: asp.value || null,
      comment: String(f.get('comment') || '').trim() || null,
      event_type: String(f.get('event') || '').trim() || null,
      photos,
    });
    if (r.error) {
      if (/reviews/i.test(r.error.message || '') && /(relation|schema cache)/i.test(r.error.message || ''))
        throw new Error('Reviews need a database update. Run caterhub_reviews_verification_patch.sql in Supabase.');
      throw new Error(r.error.code === '23505' ? 'You already reviewed this caterer.' : r.error.message);
    }
    setRating(0);
    setAsp({ food: 0, service: 0, value: 0 });
    setFiles([]);
    e.target.reset();
    setN((x) => x + 1);
    msg('Thanks! Your review is now on the profile.');
  });
  const del = async () => {
    if (!window.confirm('Delete your review?')) return;
    const r = await sb.from('reviews').delete().eq('review_id', mine.review_id);
    if (r.error) return msg(r.error.message, 1);
    setN((x) => x + 1);
  };

  return (
    <div className="reviews">
      <div className="rev-sum">
        {rows.length > 0 ? (
          <>
            <b className="rev-avg">{avg.toFixed(1)}</b>
            <Stars value={avg} size={22} />
            <span className="mut small">
              {rows.length} review{rows.length > 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <span className="mut">No reviews yet. Reviews come from customers who sent an inquiry to this caterer.</span>
        )}
      </div>

      {rows.some((r) => r.photos?.length) && (
        <div className="rev-strip">
          <b className="small">Photos from customers</b>
          <div className="rev-ph strip">
            {rows
              .flatMap((r) => r.photos || [])
              .slice(0, 8)
              .map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="Customer photo" loading="lazy" />
                </a>
              ))}
          </div>
        </div>
      )}

      {rows.map((r) => (
        <article className="rev" key={r.review_id}>
          <div className="rev-h">
            <span className="rev-av" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="8.5" r="4" />
                <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" />
              </svg>
            </span>
            <b>{r.reviewer_mask || 'customer'}</b>
            <span className="rev-date">{when(r.created_at)}</span>
          </div>
          <Stars value={r.rating} size={22} />
          <p className="rev-l">
            <span>Satisfaction:</span> {WORDS[r.rating]}
          </p>
          {[['food_rating', 'Food quality'], ['service_rating', 'Service'], ['value_rating', 'Value for money']].map(
            ([k, l]) =>
              r[k] > 0 && (
                <p className="rev-l" key={k}>
                  <span>{l}:</span> <Stars value={r[k]} size={16} />
                </p>
              ),
          )}
          {r.event_type && (
            <p className="rev-l">
              <span>Event:</span> {r.event_type}
            </p>
          )}
          {r.comment && (
            <p className="rev-l">
              <span>Review:</span> {r.comment}
            </p>
          )}
          {r.photos?.length > 0 && (
            <div className="rev-ph">
              {r.photos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  <img src={u} alt="Customer photo" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {mine && r.review_id === mine.review_id && (
            <button type="button" className="lnk small" onClick={del}>
              Delete my review
            </button>
          )}
        </article>
      ))}

      {canWrite && (
        <form className="card rev-form" onSubmit={submit}>
          <h4>How satisfied were you with {c.business_name}?</h4>
          <StarInput value={rating} onChange={setRating} />
          <p className="small mut" style={{ margin: '-10px 0 16px' }}>
            {WORDS[rating] || 'Tap a star to rate'}
          </p>
          {[['food', 'Food quality'], ['service', 'Service'], ['value', 'Value for money']].map(([k, l]) => (
            <div className="rev-asp" key={k}>
              <span>{l}</span>
              <StarInput value={asp[k]} onChange={(v) => setAsp({ ...asp, [k]: v })} size={24} label={l} />
            </div>
          ))}
          <div className="field">
            <label className="l">Tell others about it</label>
            <textarea name="comment" rows="4" maxLength={1000} placeholder="How were the food and the service?" />
          </div>
          <div className="field">
            <label className="l">Event type (optional)</label>
            <input name="event" defaultValue={lastEvent || ''} maxLength={60} placeholder="e.g. Wedding" />
          </div>
          <div className="field">
            <label className="l">Photos (optional, up to 3)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pick} />
            {files.length > 0 && <p className="tiny mut">{files.length} photo{files.length > 1 ? 's' : ''} selected</p>}
          </div>
          <button className="btn">Post review</button>
        </form>
      )}
      {!me && (
        <p className="small mut" style={{ marginTop: 14 }}>
          <Link className="lnk" to="/login">
            Log in
          </Link>{' '}
          to leave a review after you send an inquiry.
        </p>
      )}
      {me?.role === 'Customer' && lastEvent === null && !mine && (
        <p className="small mut" style={{ marginTop: 14 }}>Send this caterer an inquiry first, then you can leave a review.</p>
      )}
    </div>
  );
}
