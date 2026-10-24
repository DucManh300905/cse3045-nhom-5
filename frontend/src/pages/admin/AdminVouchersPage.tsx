import { vouchersApi } from '../../api/vouchers';
import VoucherManager from '../../components/VoucherManager';

/** Admin: voucher MAK (nền tảng chịu) + xem / tắt voucher của các quán */
export default function AdminVouchersPage() {
  return <VoucherManager api={vouchersApi.admin} isAdmin />;
}
