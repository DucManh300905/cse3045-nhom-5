"""Tìm món theo tiền tố, không phân biệt dấu, bằng cây Trie.

Mỗi từ trong tên món được đưa vào Trie, nên gõ "bo" sẽ thấy cả "Phở bò".
Mỗi nút lưu sẵn tập id món đi qua nó, nên tìm một tiền tố dài k chỉ tốn O(k),
không phụ thuộc số lượng món (so với duyệt tuyến tính O(n)).
"""

import unicodedata
from dataclasses import dataclass, field


def strip_accents(text: str) -> str:
    """'Phở Bò Đặc Biệt' -> 'pho bo dac biet'."""
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn").lower()


@dataclass(slots=True)
class _Node:
    children: dict[str, "_Node"] = field(default_factory=dict)
    item_ids: set[str] = field(default_factory=set)


class MenuTrie:
    def __init__(self) -> None:
        self._root = _Node()
        self._names: dict[str, str] = {}
        self._keys: dict[str, str] = {}  # tên đã bỏ dấu, tính một lần lúc thêm để sắp xếp nhanh

    def __len__(self) -> int:
        return len(self._names)

    def __contains__(self, item_id: object) -> bool:
        return item_id in self._names

    def insert(self, item_id: str, name: str) -> None:
        key = strip_accents(name)
        self._names[item_id] = name
        self._keys[item_id] = key
        for word in key.split():
            node = self._root
            for ch in word:
                node = node.children.setdefault(ch, _Node())
                node.item_ids.add(item_id)

    def search(self, query: str) -> list[str]:
        """Trả về tên các món khớp mọi từ trong `query` (theo tiền tố), sắp theo tên."""
        words = strip_accents(query).split()
        if not words:
            return []
        result: set[str] | None = None
        for word in words:
            ids = self._lookup(word)
            result = ids if result is None else result & ids
            if not result:
                return []
        return [self._names[i] for i in sorted(result, key=self._keys.__getitem__)]

    def _lookup(self, prefix: str) -> set[str]:
        node = self._root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return set()
        return set(node.item_ids)


def linear_search(names: dict[str, str], query: str) -> list[str]:
    """Cách làm ngây thơ để so sánh với Trie: duyệt toàn bộ món, O(n) mỗi lần tìm."""
    words = strip_accents(query).split()
    hits = [
        name
        for name in names.values()
        if all(any(w.startswith(q) for w in strip_accents(name).split()) for q in words)
    ]
    return sorted(hits, key=strip_accents)
