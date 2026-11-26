import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../shared/AuthContext';
import { msg, run } from '../shared/lib';
import { sb } from '../shared/supabase';
import { VerifiedBadge, isVerified } from '../shared/Reviews';
import { PermitCamera } from './PermitCamera';
import { matchPermit, readText } from './permitCheck';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Owner-only. The details stay hidden behind the owner's account password, and are never shown to customers.
export function VerificationCard({ c, reload }) {
  const { me } = useAuth();
  const id = c?.caterer_id;
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [row, setRow] = useState(undefined); // undefined = still loading, null = nothing submitted yet
  const [file, setFile] = useState(null);
  const [docUrl, setDocUrl] = useState('');
  const formRef = useRef(null);
  const [ocrText, setOcrText] = useState(null); // text read from the new photo
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [check, setCheck] = useState(null); // result of matching the photo with the typed details

  const vals = () => {
    const f = new FormData(formRef.current);
    return { legalName: String(f.get('legal_name') || '').trim(), registrationNo: String(f.get('registration_no') || '').trim(), permitNo: String(f.get('permit_no') || '').trim() };
  };
  const onCapture = async (blob) => {
    setFile(blob);
    setCheck(null);
    setOcrText(null);
    if (!blob) return;
    setReading(true);
    setProgress(0);
    try {
      const text = await readText(blob, setProgress);
      setOcrText(text);
      setCheck(matchPermit(text, vals()));
    } catch {
      setCheck({ ok: false, problems: ['We could not read the photo. Check your internet connection and try again.'] });
    }
    setReading(false);
  };

  const load = async () => {
    if (!id) return;
    const r = await sb.from('caterer_verification').select('*').eq('caterer_id', id).maybeSingle();
    setRow(r.error ? null : r.data);
    return r.data;
  };
  useEffect(() => {
    load();
  }, [id]);
  // lock again after 5 minutes
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [open]);

  const unlock = run(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    const { error } = await sb.auth.signInWithPassword({ email: user.email, password: pw });
    if (error) throw new Error('Wrong password. Please try again.');
    setPw('');
    if (row?.document_path) {
      const s = await sb.storage.from('verification').createSignedUrl(row.document_path, 300);
      setDocUrl(s.data?.signedUrl || '');
    }
    setOpen(true);
  });

  const save = run(async (e) => {
    const f = new FormData(e.target);
    const v = vals();
    let document_path = row?.document_path || null;
    if (file) {
      if (reading) throw new Error('Please wait until the photo has been read.');
      const m = ocrText == null ? { ok: false, problems: ['Take the photo again so we can read it.'] } : matchPermit(ocrText, v);
      setCheck(m);
      if (!m.ok) throw new Error('Photo not accepted. ' + m.problems[0]);
      if (!PHOTO_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP photo.');
      if (file.size > 5 * 1048576) throw new Error('The photo must be 5 MB or smaller.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${me.id}/${Date.now()}-permit.${ext}`;
      const up = await sb.storage.from('verification').upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      if (document_path) await sb.storage.from('verification').remove([document_path]);
      document_path = path;
    } else if (!document_path) {
      throw new Error('Take a photo of your permit or registration.');
    } else if (row && (row.legal_name !== v.legalName || row.registration_no !== v.registrationNo || row.permit_no !== v.permitNo)) {
      throw new Error('You changed your details. Take a new photo of your permit so we can match it.');
    }
    const r = await sb.from('caterer_verification').upsert(
      {
        caterer_id: id,
        legal_name: String(f.get('legal_name')).trim(),
        registration_type: f.get('registration_type'),
        registration_no: String(f.get('registration_no')).trim(),
        permit_no: String(f.get('permit_no')).trim(),
        permit_expiry: f.get('permit_expiry') || null,
        document_path,
        ...(file ? { photo_check: true } : {}),
      },
      { onConflict: 'caterer_id' },
    );
    if (r.error) {
      if (/caterer_verification/i.test(r.error.message || '') && /(relation|schema cache)/i.test(r.error.message || ''))
        throw new Error('Verification needs a database update. Run caterhub_reviews_verification_patch.sql and caterhub_auto_verification_patch.sql in Supabase.');
      throw r.error;
    }
    setFile(null);
    setOcrText(null);
    setCheck(null);
    const fresh = await load();
    if (fresh?.document_path) {
      const s = await sb.storage.from('verification').createSignedUrl(fresh.document_path, 300);
      setDocUrl(s.data?.signedUrl || '');
    }
    reload && reload();
    if (fresh?.check_status === 'Passed') msg('Verified. The badge now shows beside your business name.');
    else if (fresh?.check_status === 'Failed') msg('Saved, but not verified yet. See what to fix below the form.', 1);
    else msg('Saved. Run caterhub_auto_verification_patch.sql in Supabase to turn on automatic verification.', 1);
  });

  const verified = isVerified(c);
  const expired = !!c?.is_verified && !verified;
  const failed = row?.check_status === 'Failed';
  const status = verified
    ? ['pill sage', 'Verified']
    : expired
      ? ['pill rust', 'Permit expired']
      : failed
        ? ['pill rust', 'Needs fixes']
        : row
          ? ['pill', 'Saved']
          : ['pill', 'Not submitted'];
  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 className="sec-h" style={{ margin: 0 }}>
          Business verification
        </h3>
        <span className={status[0]}>{status[1]}</span>
        {verified && <VerifiedBadge size={24} />}
      </div>
      <p className="small mut" style={{ marginBottom: 16 }}>
        Private to you. Customers never see these details, only the verified badge beside your name. Checks run automatically when you
        save. A person does not review your documents.
      </p>

      {!id ? (
        <p className="small mut">Save your business profile first, then you can submit your verification details.</p>
      ) : !open ? (
        <form onSubmit={unlock} style={{ maxWidth: 380 }}>
          <div className="field">
            <label className="l" htmlFor="vpw">
              Enter your password to view or edit
            </label>
            <input id="vpw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
          <button className="btn">Unlock</button>
        </form>
      ) : (
        <form ref={formRef} onSubmit={save} onChange={() => ocrText != null && setCheck(matchPermit(ocrText, vals()))}>
          <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="field">
              <label className="l">Registered business name *</label>
              <input name="legal_name" defaultValue={row?.legal_name || ''} required maxLength={120} />
            </div>
            <div className="field">
              <label className="l">Registration type *</label>
              <select name="registration_type" defaultValue={row?.registration_type || 'DTI'}>
                <option value="DTI">DTI (sole proprietor)</option>
                <option value="SEC">SEC (corporation / partnership)</option>
                <option value="CDA">CDA (cooperative)</option>
              </select>
            </div>
            <div className="field">
              <label className="l">Registration number *</label>
              <input name="registration_no" defaultValue={row?.registration_no || ''} required maxLength={60} />
            </div>
            <div className="field">
              <label className="l">Business / mayor's permit number *</label>
              <input name="permit_no" defaultValue={row?.permit_no || ''} required maxLength={60} />
            </div>
            <div className="field">
              <label className="l">Permit expiry *</label>
              <input type="date" name="permit_expiry" defaultValue={row?.permit_expiry || ''} required />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="l">Photo of your permit or registration *</label>
              <PermitCamera onCapture={onCapture} busy={reading} />
              {reading && <p className="small mut" style={{ marginTop: 8 }}>Reading your document… {Math.round(progress * 100)}%</p>}
              {!reading && check && check.ok && (
                <p className="small" style={{ marginTop: 8, color: 'var(--sage-ink)', fontWeight: 600 }}>
                  ✓ We could read your business name and number on the document.
                </p>
              )}
              {!reading && check && !check.ok && (
                <div className="warn-b" role="alert" style={{ margin: '10px 0 0' }}>
                  <b>Photo not accepted</b>
                  {check.problems.join(' ')} Retake the photo with the permit flat, well lit, and fully in view.
                </div>
              )}
              <p className="tiny mut">Take the photo now with your camera. Uploading an old image is not allowed.</p>
              {docUrl && !file && (
                <a className="lnk small" href={docUrl} target="_blank" rel="noreferrer">
                  View saved photo ↗
                </a>
              )}
            </div>
          </div>
          {failed && row.check_note && (
            <div className="warn-b" role="alert" style={{ marginTop: 6 }}>
              <b>Not verified yet. Please fix:</b> {row.check_note}
            </div>
          )}
          <p className="tiny mut">Use your real registration and permit numbers. Fake or copied documents can get your business removed.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button className="btn">Save and verify</button>
            <button type="button" className="btn out" onClick={() => setOpen(false)}>
              Lock
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
