import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <main className="coming-soon">
      <LogoMark size={160} />
      <h1>{title}</h1>
      <p>Khu vực này đang được phát triển và sẽ sớm ra mắt.</p>
      <Link to="/" className="btn-soft">← Quay lại trang chủ</Link>
    </main>
  );
}
