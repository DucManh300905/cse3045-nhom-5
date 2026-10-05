import type { Dish } from '../types';

// TODO: thay bằng API món ăn khi backend có module menu
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=75`;

export const SHOPS = ['Quán A', 'Quán B', 'Quán C'];

export const DISHES: Dish[] = [
  { id: 'd1', name: 'Bánh mì thịt nướng', description: 'Bánh mì + thịt nướng + rau + đồ chua', price: 20000, category: 'FOOD', shop: 'Quán A', stock: 10, prepMinutes: 10, closesAt: '17:59', image: img('photo-1600454309261-3dc9b7597637'), popularity: 98 },
  { id: 'd2', name: 'Phở bò tái', description: 'Bánh phở + bò tái + hành lá + nước dùng hầm xương', price: 35000, category: 'FOOD', shop: 'Quán B', stock: 20, prepMinutes: 15, closesAt: '20:00', image: img('photo-1582878826629-29b7ad1cdc43'), popularity: 96 },
  { id: 'd3', name: 'Cơm rang hải sản', description: 'Cơm rang + tôm + mực + trứng + rau thơm', price: 32000, category: 'FOOD', shop: 'Quán A', stock: 30, prepMinutes: 15, closesAt: '17:59', image: img('photo-1512058564366-18510be2db19'), popularity: 90 },
  { id: 'd4', name: 'Gà rán giòn (2 miếng)', description: 'Đùi gà tẩm bột chiên giòn + tương ớt', price: 39000, category: 'FOOD', shop: 'Quán C', stock: 15, prepMinutes: 15, closesAt: '21:00', image: img('photo-1626082927389-6cd097cdc6ec'), popularity: 94 },
  { id: 'd5', name: 'Mì tôm trứng lòng đào', description: 'Mì + tôm + trứng lòng đào + đậu Hà Lan', price: 30000, category: 'FOOD', shop: 'Quán B', stock: 25, prepMinutes: 12, closesAt: '20:00', image: img('photo-1569718212165-3a8278d5f624'), popularity: 88 },
  { id: 'd6', name: 'Mì xào bò', description: 'Mì trứng xào + thịt bò + rau cải', price: 30000, category: 'FOOD', shop: 'Quán B', stock: 0, prepMinutes: 12, closesAt: '20:00', image: img('photo-1585032226651-759b368d7246'), popularity: 80 },
  { id: 'd7', name: 'Cơm gà rau củ', description: 'Cơm + ức gà áp chảo + đậu que + rau củ', price: 35000, category: 'FOOD', shop: 'Quán A', stock: 12, prepMinutes: 15, closesAt: '17:59', image: img('photo-1547592180-85f173990554'), popularity: 84 },
  { id: 'd8', name: 'Há cảo hấp (6 viên)', description: 'Há cảo nhân tôm thịt + nước chấm', price: 25000, category: 'FOOD', shop: 'Quán C', stock: 18, prepMinutes: 10, closesAt: '21:00', image: img('photo-1563245372-f21724e3856d'), popularity: 82 },
  { id: 'd9', name: 'Burger bò phô mai', description: 'Bánh burger + bò nướng + phô mai + rau', price: 45000, category: 'FOOD', shop: 'Quán C', stock: 10, prepMinutes: 12, closesAt: '21:00', image: img('photo-1568901346375-23c9450c58cd'), popularity: 86 },
  { id: 'd10', name: 'Khoai tây chiên', description: 'Khoai tây chiên giòn + sốt phô mai', price: 20000, category: 'FOOD', shop: 'Quán C', stock: 40, prepMinutes: 8, closesAt: '21:00', image: img('photo-1573080496219-bb080dd4f877'), popularity: 85 },
  { id: 'd11', name: 'Salad rau củ', description: 'Rau xanh + bơ + đậu gà + cà chua bi', price: 35000, category: 'FOOD', shop: 'Quán A', stock: 8, prepMinutes: 8, closesAt: '17:59', image: img('photo-1512621776951-a57141f2eefd'), popularity: 70 },
  { id: 'd12', name: 'Trà chanh', description: 'Trà xanh + chanh tươi + đá', price: 15000, category: 'DRINK', shop: 'Quán A', stock: 50, prepMinutes: 5, closesAt: '17:59', image: img('photo-1556679343-c7306c1976bc'), popularity: 97 },
  { id: 'd13', name: 'Cà phê sữa đá', description: 'Cà phê phin + sữa đặc + đá', price: 20000, category: 'DRINK', shop: 'Quán B', stock: 40, prepMinutes: 5, closesAt: '20:00', image: img('photo-1461023058943-07fcbe16d735'), popularity: 95 },
  { id: 'd14', name: 'Trà sữa trân châu', description: 'Trà đen + sữa + trân châu đường đen', price: 25000, category: 'DRINK', shop: 'Quán C', stock: 30, prepMinutes: 5, closesAt: '21:00', image: img('photo-1558857563-b371033873b8'), popularity: 99 },
  { id: 'd15', name: 'Soda chanh bạc hà', description: 'Soda + chanh + lá bạc hà + đá', price: 22000, category: 'DRINK', shop: 'Quán C', stock: 20, prepMinutes: 5, closesAt: '21:00', image: img('photo-1551024709-8f23befc6f87'), popularity: 78 },
  { id: 'd16', name: 'Sinh tố xoài', description: 'Xoài chín + sữa chua + đá xay', price: 25000, category: 'DRINK', shop: 'Quán B', stock: 15, prepMinutes: 5, closesAt: '20:00', image: img('photo-1525385133512-2f3bdd039054'), popularity: 83 },
];

export const findDish = (id: string) => DISHES.find(d => d.id === id);
