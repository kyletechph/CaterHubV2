import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, Guard } from './shared/AuthContext';
import { configured } from './shared/supabase';
import { Empty } from './shared/lib';
import { Footer, Header } from './shared/Header';
import Lightbox from './shared/Lightbox';
import { Home } from './public/Home';
import { List } from './public/CatererList';
import { Profile } from './public/CatererProfile';
import { Gallery } from './public/CatererGallery';
import { Pkg } from './public/PackageDetail';
import { Compare } from './public/Compare';
import { Saved } from './public/Saved';
import { Signup } from './auth/Signup';
import { Login } from './auth/Login';
import { ResetPassword } from './auth/ResetPassword';
import { Privacy } from './public/Privacy';
import { Inquire } from './customer/SendInquiry';
import { Sent } from './customer/InquirySent';
import { My } from './customer/MyInquiries';
import { InquiryDetail } from './customer/InquiryDetail';
import { Notes } from './customer/Notifications';
import Owner from './owner/OwnerLayout';
import { Overview } from './owner/Dashboard';
import { OwnerInquiries } from './owner/Inquiries';
import { RespondInquiry } from './owner/RespondInquiry';
import { Availability } from './owner/Availability';
import { Packages } from './owner/Packages';
import { PackageEditor } from './owner/PackageEditor';
import { ProfileTab } from './owner/BusinessProfile';
import { OwnerNotes } from './owner/OwnerNotifications';
const NotFound = () => (
  <Empty>
    <h3 className="h3">Page not found</h3>
    <p className="mut">
      The page you are looking for does not exist. <Link to="/">Go home</Link>
    </p>
  </Empty>
);
export default function App() {
  const loc = useLocation();
  const workspace = loc.pathname.startsWith('/owner');
  if (!configured)
    return (
      <Empty>
        Copy <b>.env.example</b> to <b>.env</b> and set your Supabase URL and anon key, then restart{' '}
        <b>npm run dev</b>.
      </Empty>
    );
  const cust = (el) => <Guard role="Customer">{el}</Guard>;
  return (
    <AuthProvider>
      <Lightbox />
      {!workspace && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/caterers" element={<List />} />
        <Route path="/caterer/:id" element={<Profile />} />
        <Route path="/caterer/:id/gallery" element={<Gallery />} />
        <Route path="/package/:id" element={<Pkg />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/inquire/:id" element={cust(<Inquire />)} />
        <Route path="/inquire/sent/:ref" element={cust(<Sent />)} />
        <Route path="/my" element={cust(<My />)} />
        <Route path="/my/:ref" element={cust(<InquiryDetail />)} />
        <Route path="/notes" element={cust(<Notes />)} />
        <Route
          path="/owner"
          element={
            <Guard role="Caterer Owner">
              <Owner />
            </Guard>
          }
        >
          <Route index element={<Overview />} />
          <Route path="inq" element={<OwnerInquiries />} />
          <Route path="inq/:ref" element={<RespondInquiry />} />
          <Route path="av" element={<Availability />} />
          <Route path="pk" element={<Packages />} />
          <Route path="pk/:id" element={<PackageEditor />} />
          <Route path="pf" element={<ProfileTab />} />
          <Route path="nt" element={<OwnerNotes />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!workspace && <Footer />}
    </AuthProvider>
  );
}
