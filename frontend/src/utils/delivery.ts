import type { DeliveryStatus, ShipperDocumentType, ShipperStatus, VehicleType } from '../types';

// Tài xế MAK: nhãn tiếng Việt + tiện ích ảnh / bản đồ dùng chung cho khách, quán, tài xế, admin

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  SEARCHING: 'Đang tìm tài xế',
  NO_SHIPPER: 'Chưa tìm được tài xế',
  ASSIGNED: 'Tài xế đang tới quán',
  ARRIVED_AT_STORE: 'Tài xế đã tới quán',
  PICKED_UP: 'Tài xế đang giao',
  DELIVERED: 'Đã giao',
  FAILED: 'Giao không thành công',
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  MOTORBIKE: 'Xe máy',
  EBIKE: 'Xe đạp / xe máy điện',
  BICYCLE: 'Xe đạp',
};

export const SHIPPER_STATUS_LABEL: Record<ShipperStatus, string> = {
  DRAFT: 'Chưa nộp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  BLOCKED: 'Bị khóa',
};

export const SHIPPER_DOCUMENTS: { type: ShipperDocumentType; label: string; motorbikeOnly?: boolean }[] = [
  { type: 'ID_CARD', label: 'CCCD (mặt trước)' },
  { type: 'DRIVER_LICENSE', label: 'Bằng lái xe máy', motorbikeOnly: true },
  { type: 'VEHICLE_REGISTRATION', label: 'Đăng ký xe', motorbikeOnly: true },
];

export const requiredShipperDocuments = (vehicle: VehicleType) =>
  SHIPPER_DOCUMENTS.filter(d => !d.motorbikeOnly || vehicle === 'MOTORBIKE');

/**
 * Ảnh chụp từ điện thoại thường 3–8 MB: thu nhỏ còn cạnh dài 1280 px, JPEG 80% (~200–400 KB) trước khi gửi.
 * Trình duyệt không đọc được ảnh (vd HEIC trên máy cũ) -> gửi nguyên file, server giới hạn 5 MB.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Giải mã đường đi dạng "encoded polyline" (Goong / Google) -> [[lat, lng], ...] */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** "Còn ~7 phút tới quán" / "~12 phút nữa tới nơi" */
export const etaText = (eta?: { minutes: number; target: 'STORE' | 'CUSTOMER' } | null) =>
  eta ? (eta.target === 'STORE' ? `còn ~${eta.minutes} phút tới quán` : `~${eta.minutes} phút nữa tới nơi`) : '';
