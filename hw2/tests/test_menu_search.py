from mak_dsa.menu_search import MenuTrie, linear_search, strip_accents

MENU = {
    "1": "Phở bò",
    "2": "Bún bò Huế",
    "3": "Bún chả",
    "4": "Đậu phụ rán",
    "5": "Bánh mì trứng",
}


def build() -> MenuTrie:
    trie = MenuTrie()
    for item_id, name in MENU.items():
        trie.insert(item_id, name)
    return trie


def test_strip_accents():
    assert strip_accents("Phở Bò Đặc Biệt") == "pho bo dac biet"


def test_prefix_and_accent_insensitive():
    trie = build()
    assert trie.search("bo") == ["Bún bò Huế", "Phở bò"]
    assert trie.search("PHỞ") == ["Phở bò"]
    assert trie.search("dau") == ["Đậu phụ rán"]


def test_multi_word_query_is_and():
    assert build().search("bun bo") == ["Bún bò Huế"]


def test_no_match_and_empty():
    trie = build()
    assert trie.search("pizza") == []
    assert trie.search("   ") == []


def test_len_and_contains():
    trie = build()
    assert len(trie) == 5
    assert "3" in trie and "99" not in trie


def test_matches_linear_search():
    trie = build()
    for query in ("b", "bun", "banh mi", "ra", "x"):
        assert trie.search(query) == linear_search(MENU, query)
