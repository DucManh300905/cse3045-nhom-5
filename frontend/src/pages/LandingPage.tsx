import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

const OPTIONS = [
  { to: '/menu', title: 'Khách hàng', text: 'Xem thực đơn, tìm món và đặt đồ ăn giao tận nơi.', primary: true },
  { to: '/owner', title: 'Chủ quán', text: 'Quản lý thực đơn, số suất mỗi ngày và đơn của quán.' },
  { to: '/admin', title: 'Quản trị viên', text: 'Duyệt quán, quản lý người dùng và toàn hệ thống.' },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="container landing-grid">
        <div className="landing-art">
          <div className="sun" aria-hidden />
          <LogoMark size={340} className="landing-logo" />
          <span className="float-chip chip-a">Món mới mỗi ngày</span>
          <span className="float-chip chip-b">Giao nhanh Hòa Lạc</span>
        </div>

        <div className="landing-copy">
          <span className="eyebrow">MAK Food and Drink</span>
          <h1>Đói bụng?<br /><em>Có MAK lo!</em></h1>
          <p className="lead">Đồ ăn, đồ uống ngon – giá sinh viên – cho sinh viên và người dân khu vực Hòa Lạc.</p>

          <p className="choose-label">Bạn là…</p>
          <ul className="role-list">
            {OPTIONS.map(o => (
              <li key={o.to}>
                <Link to={o.to} className={o.primary ? 'role-row primary' : 'role-row'}>
                  <span className="role-text">
                    <b>{o.title}</b>
                    <small>{o.text}</small>
                  </span>
                  <span className="role-arrow" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}