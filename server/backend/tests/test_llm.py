import pytest
from server.backend.llm import _extract_json

def test_extract_json_clean():
    clean = '{"a": 1}'
    assert _extract_json(clean) == {"a": 1}

def test_extract_json_markdown():
    markdown = 'Here is the JSON:\n```json\n{"b": 2}\n```\nHope it helps.'
    assert _extract_json(markdown) == {"b": 2}

def test_extract_json_invalid():
    with pytest.raises(Exception):
        _extract_json('No json here')
