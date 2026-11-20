// Một số module (CartContext, api/client) đụng tới localStorage ngay khi được import.
// Môi trường test là Node, không có localStorage của trình duyệt, nên thay bằng bản lưu trong RAM.
const store = new Map<string, string>();

const memoryStorage: Storage = {
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
  getItem: key => store.get(key) ?? null,
  key: index => [...store.keys()][index] ?? null,
  removeItem: key => {
    store.delete(key);
  },
  setItem: (key, value) => {
    store.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
