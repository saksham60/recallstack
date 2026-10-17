"""Actual CPython execution of the SAME source embedded for Pyodide/Nebius."""

import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "web/src/lib/dsa-execution/python/runner_harness.py"


@pytest.fixture
def harness():
    spec = importlib.util.spec_from_file_location("reasonai_test_harness", SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def contract(codec="json", output="json", invocation="function", **result):
    return {
        "entrypoint": "solve",
        "inputMode": "kwargs",
        "checker": "exact_json",
        "adapter": {
            "id": "reasonai-python",
            "version": 1,
            "invocation": invocation,
            "parameters": [{"name": "value", "pythonType": "Any", "codec": codec}],
            "returnType": "Any",
            "result": {"source": "return", "codec": output, **result},
            **({"className": "Solution"} if invocation == "method" else {}),
        },
    }


@pytest.mark.parametrize(
    "mode,value,source",
    [
        ("single", {"nums": [1, 2]}, "def solve(payload): return sum(payload['nums'])"),
        ("kwargs", {"nums": [1, 2]}, "def solve(nums): return sum(nums)"),
        ("args", [[1, 2]], "def solve(nums): return sum(nums)"),
    ],
)
def test_legacy_bindings_share_real_python_semantics(harness, mode, value, source):
    result = harness.run_case(
        source, {"entrypoint": "solve", "inputMode": mode, "checker": "exact_json"}, value
    )
    assert result["status"] == "ok" and result["actual"] == 3


def test_typed_function_and_solution_method(harness):
    result = harness.run_case(
        "def solve(value: List[int]) -> int:\n    return sum(value)",
        contract(),
        {"value": [1, 2, 3]},
    )
    assert result["actual"] == 6
    result = harness.run_case(
        "class Solution:\n    def solve(self, value: List[int]) -> int:\n        return sum(value)",
        contract(invocation="method"),
        {"value": [2, 3]},
    )
    assert result["actual"] == 5


def test_in_place_mutation_and_returned_prefix(harness):
    spec = contract(source="parameter", parameter="value")
    result = harness.run_case("def solve(value): value.sort()", spec, {"value": [3, 1, 2]})
    assert result["actual"] == [1, 2, 3]
    spec["adapter"]["result"]["prefixLengthFromReturn"] = True
    result = harness.run_case(
        "def solve(value):\n    value[:] = sorted(set(value))\n    return len(value)",
        spec,
        {"value": [2, 2, 1]},
    )
    assert result["actual"] == [1, 2]


def test_design_sequence_is_one_isolated_state_machine(harness):
    spec = contract()
    spec["adapter"].update(
        {
            "invocation": "design",
            "className": "MinStack",
            "parameters": [],
            "methods": [
                {"name": "push", "parameters": [{"name": "value", "codec": "json"}]},
                {"name": "getMin", "parameters": []},
                {"name": "pop", "parameters": []},
            ],
        }
    )
    source = (
        "class MinStack:\n"
        "    def __init__(self): self.values = []\n"
        "    def push(self, value): self.values.append(value)\n"
        "    def pop(self): self.values.pop()\n"
        "    def getMin(self): return min(self.values)"
    )
    fixture = {
        "operations": ["MinStack", "push", "push", "getMin", "pop", "getMin"],
        "arguments": [[], [3], [1], [], [], []],
    }
    assert harness.run_case(source, spec, fixture)["actual"] == [None, None, None, 1, None, 3]
    assert (
        harness.run_case(
            source, spec, {"operations": ["MinStack", "getMin"], "arguments": [[], []]}
        )["status"]
        == "runtime_error"
    )


@pytest.mark.parametrize("value", [[], [1], [1, 2, 3]])
def test_linked_list_serialization(harness, value):
    source = (
        "def solve(value):\n"
        "    previous = None\n"
        "    while value:\n"
        "        following = value.next\n"
        "        value.next = previous\n"
        "        previous, value = value, following\n"
        "    return previous"
    )
    assert harness.run_case(source, contract("linked_list", "linked_list"), {"value": value})[
        "actual"
    ] == list(reversed(value))


def test_tree_level_order_and_nulls(harness):
    source = (
        "def solve(value):\n"
        "    if value:\n"
        "        value.left, value.right = solve(value.right), solve(value.left)\n"
        "    return value"
    )
    assert harness.run_case(source, contract("tree", "tree"), {"value": [1, 2, 3, None, 4]})[
        "actual"
    ] == [1, 3, 2, None, None, 4]
    assert harness.run_case(source, contract("tree", "tree"), {"value": []})["actual"] == []


def test_graph_cycles_and_clone_identity(harness):
    spec = contract("graph", "graph")
    assert harness.run_case("def solve(value): return value", spec, {"value": [[2], [1]]})[
        "actual"
    ] == [[2], [1]]
    spec["adapter"]["result"]["requireDetached"] = True
    assert (
        harness.run_case("def solve(value): return value", spec, {"value": [[2], [1]]})["status"]
        == "runtime_error"
    )


def test_shared_node_table_preserves_identity_and_cycles(harness):
    spec = contract("node_ref", "node_index")
    spec["adapter"]["parameters"][0]["nodeTable"] = "shared"
    spec["adapter"]["parameters"].append(
        {"name": "second", "codec": "node_ref", "nodeTable": "shared"}
    )
    spec["adapter"]["result"]["identityParameter"] = "value"
    fixture = {
        "nodeTables": {"shared": {"values": [10, 20, 30], "next": [1, 0, 1]}},
        "value": 0,
        "second": 2,
    }
    source = (
        "def solve(value, second):\n    assert value.next is second.next\n    return value.next"
    )
    assert harness.run_case(source, spec, fixture)["actual"] == 1


def test_cycles_are_never_naively_recursed(harness):
    result = harness.run_case(
        "def solve(value):\n    value.next = value\n    return value",
        contract("linked_list", "linked_list"),
        {"value": [1]},
    )
    assert result["status"] == "runtime_error" and "SerializationError" in result["stderr"]


@pytest.mark.parametrize(
    "source,status,word",
    [
        ("def solve(: pass", "syntax_error", "SyntaxError"),
        ("  def solve(value): return value", "syntax_error", "IndentationError"),
        ("def solve(value):\n    raise TypeError('bad value')", "runtime_error", "TypeError"),
        ("def solve(value):\n    return missing", "runtime_error", "NameError"),
        ("def solve(value):\n    return {1,2}", "runtime_error", "serializable"),
        ("def solve(value):\n    print('x'*10000)", "output_limit_exceeded", "4096"),
    ],
)
def test_bounded_errors_and_readable_python_tracebacks(harness, source, status, word):
    result = harness.run_case(source, contract(), {"value": []})
    assert result["status"] == status and word in result["stderr"]
    assert len(result["stderr"]) <= 4096


def test_generated_browser_and_server_source_bytes_match():
    source = SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    server = (SOURCE.parent / "harness.generated.ts").read_text(encoding="utf-8")
    browser = (ROOT / "web/public/dsa/runner-harness.mjs").read_text(encoding="utf-8")
    assert server == browser
    assert json.loads(re.search(r"export const HARNESS_SOURCE = (.*);", server).group(1)) == source
    assert hashlib.sha256(source.encode()).hexdigest() in server
