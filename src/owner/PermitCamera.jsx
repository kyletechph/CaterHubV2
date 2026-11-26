import { useEffect, useRef, useState } from 'react';

// Take a live photo with the camera (no picking an existing image from the gallery).
export function PermitCamera({ onCapture, busy }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [live, setLive] = useState(false);
  const [shot, setShot] = useState('');
  const [err, setErr] = useState('');
  const canStream = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLive(false);
  };
  useEffect(() => stop, []);

  const open = async () => {
    setErr('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      setLive(true);
      setTimeout(() => {
        if (video.current) video.current.srcObject = stream.current;
      }, 0);
    } catch {
      setErr('We could not open the camera. Allow camera access in your browser, or open this page on your phone.');
    }
  };
  const take = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 1600 / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        if (shot) URL.revokeObjectURL(shot);
        const url = URL.createObjectURL(blob);
        setShot(url);
        stop();
        onCapture(blob, url);
      },
      'image/jpeg',
      0.9,
    );
  };
  // phones that cannot stream (rare): this input opens the camera app directly
  const fromPhoneCamera = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setShot(url);
    onCapture(f, url);
  };
  const retake = () => {
    if (shot) URL.revokeObjectURL(shot);
    setShot('');
    onCapture(null, '');
    if (canStream) open();
  };

  return (
    <div className="pcam">
      {live && (
        <>
          <video ref={video} autoPlay playsInline muted />
          <div className="pcam-bar">
            <button type="button" className="btn" onClick={take}>
              Take photo
            </button>
            <button type="button" className="btn out" onClick={stop}>
              Cancel
            </button>
          </div>
          <p className="tiny mut">Lay the permit flat in good light. Keep the business name and numbers inside the frame.</p>
        </>
      )}
      {!live && shot && (
        <>
          <img src={shot} alt="Photo of your permit" />
          <div className="pcam-bar">
            <button type="button" className="btn out" onClick={retake} disabled={busy}>
              Retake photo
            </button>
          </div>
        </>
      )}
      {!live && !shot && (
        <>
          {canStream ? (
            <button type="button" className="btn" onClick={open}>
              Open camera
            </button>
          ) : (
            <input type="file" accept="image/*" capture="environment" onChange={fromPhoneCamera} aria-label="Take a photo of your permit" />
          )}
          {err && <p className="small" style={{ color: 'var(--rust)', marginTop: 8 }}>{err}</p>}
        </>
      )}
    </div>
  );
}
