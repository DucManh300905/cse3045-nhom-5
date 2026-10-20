import { Link } from 'react-router-dom';
import { vouchersApi } from '../../api/vouchers';
import VoucherManager from '../../components/VoucherManager';
import { useOwner } from './OwnerLayout';

/** Chủ quán tạo voucher riêng cho quán (quán chịu tiền giảm) */
export default function OwnerVouchersPage() {
  const { restaurant } = useOwner();

  if (!restaurant || restaurant.status !== 'APPROVED') {
    return (
      <div className="empty-state">
        <h2>{restaurant ? 'Quán cần được duyệt trước' : 'Bạn chưa có quán'}</h2>
        <p>Voucher chỉ tạo được khi quán đã được duyệt.</p>
        <Link to="/owner" className="btn-primary">Về hồ sơ quán</Link>
      </div>
    );
  }

  return <VoucherManager api={vouchersApi.merchant} />;
}
