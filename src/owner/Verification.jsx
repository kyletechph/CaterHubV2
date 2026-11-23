import { useEffect, useState } from 'react';
import { useAuth } from '../shared/AuthContext';
import { msg, run } from '../shared/lib';
import { sb } from '../shared/supabase';
import { VerifiedBadge } from '../shared/Reviews';

const DOCS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Owner-only. The details stay hidden behind the owner's account password, and are never shown to customers.
export function VerificationCard({ c, reload }) {
  const { me } = useAuth();
  const id = c?.caterer_id;
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [row, setRow] = useState(undefined); // undefined = still loading, null = nothing submitted yet
  const [file, setFile] = useState(null);
  const [docUrl, setDocUrl] = useState('');

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
    let document_path = row?.document_path || null;
    if (file) {
      if (!DOCS.includes(file.type)) throw new Error('Upload a JPG, PNG, WebP or PDF file.');
      if (file.size > 5 * 1048576) throw new Error('The file must be 5 MB or smaller.');
      const path = `${me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const up = await sb.storage.from('verification').upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      if (document_path) await sb.storage.from('verification').remove([document_path]);
      document_path = path;
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
      },
      { onConflict: 'caterer_id' },
    );
    if (r.error) {
      if (/caterer_verification/i.test(r.error.message || '') && /(relation|schema cache)/i.test(r.error.message || ''))
        throw new Error('Verification needs a database update. Run caterhub_reviews_verification_patch.sql in Supabase.');
      throw r.error;
    }
    setFile(null);
    const fresh = await load();
    if (fresh?.document_path) {
      const s = await sb.storage.from('verification').createSignedUrl(fresh.document_path, 300);
      setDocUrl(s.data?.signedUrl || '');
    }
    reload && reload();
    msg('Sent for review. The verified badge appears once CaterHub approves it.');
  });

  const verified = !!c?.is_verified;
  const status = verified ? ['pill sage', 'Verified'] : row ? ['pill rust', 'Pending review'] : ['pill', 'Not submitted'];
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
        Private to you. Customers never see these details; they only see the verified badge beside your name once approved.
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
        <form onSubmit={save}>
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
              <label className="l">Permit expiry (optional)</label>
              <input type="date" name="permit_expiry" defaultValue={row?.permit_expiry || ''} />
            </div>
            <div className="field">
              <label className="l">Permit or registration scan (optional)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
              <p className="tiny mut">JPG, PNG, WebP or PDF · Max 5 MB</p>
              {docUrl && !file && (
                <a className="lnk small" href={docUrl} target="_blank" rel="noreferrer">
                  View uploaded file ↗
                </a>
              )}
            </div>
          </div>
          <p className="tiny mut">Saving changes sends your business back to pending review.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <button className="btn">Submit for review</button>
            <button type="button" className="btn out" onClick={() => setOpen(false)}>
              Lock
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
