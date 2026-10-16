"""Authoritative invocation/serialization only. NO expected outputs or checkers.

Distributed byte-identically to Pyodide and the unprivileged Nebius child.
Each test must use a fresh interpreter/process. Design operations share state
only inside their own test. Limits outside this module enforce CPU/wall/memory.
"""

import contextlib
import io
import json
import traceback
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

HARNESS_VERSION = 1
MAX_NODES = 10000


class OutputLimitError(Exception):
    pass


class SerializationError(Exception):
    pass


class BoundedOutput(io.TextIOBase):
    def __init__(self, limit=4096):
        self.limit = limit
        self.parts = []
        self.size = 0

    def write(self, value):
        value = str(value)
        size = len(value.encode("utf-8"))
        if self.size + size > self.limit:
            raise OutputLimitError("Printed output exceeded the 4096-byte limit")
        self.parts.append(value)
        self.size += size
        return len(value)

    def getvalue(self):
        return "".join(self.parts)


class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next

    @property
    def value(self):
        return self.val

    @value.setter
    def value(self, value):
        self.val = value


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = [] if neighbors is None else neighbors


class CodecContext:
    def __init__(self, fixture):
        self.fixture = fixture
        self.tables = {}
        self.identities = {}
        self.input_nodes = set()

    def decode(self, value, parameter):
        codec = parameter.get("codec", "json")
        if codec == "json":
            return value
        if codec == "linked_list":
            if not isinstance(value, list) or len(value) > MAX_NODES:
                raise ValueError("Linked-list input must be a bounded array")
            head = None
            for item in reversed(value):
                head = ListNode(item, head)
                self.input_nodes.add(id(head))
            return head
        if codec == "tree":
            if not isinstance(value, list) or len(value) > MAX_NODES:
                raise ValueError("Tree input must be a bounded level-order array")
            if not value or value[0] is None:
                if any(item is not None for item in value):
                    raise ValueError("Tree contains unreachable nodes")
                return None
            root = TreeNode(value[0])
            self.input_nodes.add(id(root))
            queue, index = deque([root]), 1
            while queue and index < len(value):
                parent = queue.popleft()
                for name in ("left", "right"):
                    if index >= len(value):
                        break
                    item = value[index]
                    index += 1
                    if item is not None:
                        child = TreeNode(item)
                        self.input_nodes.add(id(child))
                        setattr(parent, name, child)
                        queue.append(child)
            if any(item is not None for item in value[index:]):
                raise ValueError("Tree contains unreachable nodes")
            return root
        if codec == "graph":
            if not isinstance(value, list) or len(value) > MAX_NODES:
                raise ValueError("Graph input must be a bounded adjacency array")
            nodes = [Node(i + 1) for i in range(len(value))]
            self.input_nodes.update(id(node) for node in nodes)
            for node, neighbors in zip(nodes, value):
                if not isinstance(neighbors, list):
                    raise ValueError("Invalid adjacency row")
                for index in neighbors:
                    if type(index) is not int or not 1 <= index <= len(nodes):
                        raise ValueError("Invalid graph node reference")
                    node.neighbors.append(nodes[index - 1])
            return nodes[0] if nodes else None
        if codec == "node_ref":
            table_id = parameter.get("nodeTable")
            if table_id not in self.tables:
                table = self.fixture["nodeTables"][table_id]
                values, links = table["values"], table["next"]
                if not isinstance(values, list) or len(values) > MAX_NODES or len(values) != len(links):
                    raise ValueError("Invalid indexed node table")
                nodes = [ListNode(item) for item in values]
                self.input_nodes.update(id(node) for node in nodes)
                for index, target in enumerate(links):
                    if target is not None and (type(target) is not int or not 0 <= target < len(nodes)):
                        raise ValueError("Invalid next-node reference")
                    nodes[index].next = nodes[target] if target is not None else None
                self.tables[table_id] = nodes
                self.identities.update({id(node): index for index, node in enumerate(nodes)})
            if value is None:
                return None
            nodes = self.tables[table_id]
            if type(value) is not int or not 0 <= value < len(nodes):
                raise ValueError("Invalid head reference")
            return nodes[value]
        raise ValueError("Unsupported input codec")

    def encode(self, value, codec, require_detached=False):
        if codec == "json":
            return value
        if codec == "node_value":
            return None if value is None else value.val
        if codec == "node_index":
            if value is None:
                return None
            if id(value) not in self.identities:
                raise SerializationError("Returned node is not part of the approved input table")
            return self.identities[id(value)]
        if codec == "linked_list":
            output, seen = [], set()
            while value is not None:
                if id(value) in seen or len(seen) >= MAX_NODES:
                    raise SerializationError("Cyclic or oversized linked-list output")
                if require_detached and id(value) in self.input_nodes:
                    raise SerializationError("Output aliases an input node; an independent clone is required")
                seen.add(id(value))
                output.append(value.val)
                value = value.next
            return output
        if codec == "tree":
            if value is None:
                return []
            output, queue, seen = [], deque([value]), set()
            while queue:
                node = queue.popleft()
                if node is None:
                    output.append(None)
                    continue
                if id(node) in seen or len(seen) >= MAX_NODES:
                    raise SerializationError("Cyclic, shared or oversized tree output")
                if require_detached and id(node) in self.input_nodes:
                    raise SerializationError("Output aliases an input node; an independent clone is required")
                seen.add(id(node))
                output.append(node.val)
                queue.extend((node.left, node.right))
            while output and output[-1] is None:
                output.pop()
            return output
        if codec == "graph":
            if value is None:
                return []
            queue, seen, rows = deque([value]), set(), {}
            while queue:
                node = queue.popleft()
                if id(node) in seen:
                    continue
                if require_detached and id(node) in self.input_nodes:
                    raise SerializationError("Output aliases an input node; an independent clone is required")
                if len(seen) >= MAX_NODES or type(node.val) is not int or node.val in rows:
                    raise SerializationError("Invalid, duplicate or oversized graph labels")
                seen.add(id(node))
                rows[node.val] = sorted(neighbor.val for neighbor in node.neighbors)
                queue.extend(node.neighbors)
            if set(rows) != set(range(1, len(rows) + 1)):
                raise SerializationError("Graph output must use contiguous labels starting at one")
            return [rows[index] for index in range(1, len(rows) + 1)]
        raise SerializationError("Unsupported output codec")


def _parameters(fixture, mode, parameters, context):
    if mode == "args" and (not isinstance(fixture, list) or len(fixture) != len(parameters)):
        raise ValueError("Positional fixture argument count does not match the contract")
    if mode == "kwargs":
        allowed = {parameter["name"] for parameter in parameters}
        if any(parameter.get("codec") == "node_ref" for parameter in parameters):
            allowed.add("nodeTables")
        if not isinstance(fixture, dict) or set(fixture) != allowed:
            raise ValueError("Keyword fixture fields do not match the contract")
    values = {}
    for index, parameter in enumerate(parameters):
        name = parameter["name"]
        raw = fixture[name] if mode == "kwargs" else fixture[index] if mode == "args" else fixture
        values[name] = context.decode(raw, parameter)
    return values


def _invoke(source, contract, fixture):
    context = CodecContext(fixture)
    scope = {"__name__": "solution", "ListNode": ListNode, "TreeNode": TreeNode, "Node": Node,
             "List": List, "Optional": Optional, "Any": Any, "Tuple": Tuple, "Dict": Dict}
    exec(compile(source, "solution.py", "exec"), scope)
    adapter = contract.get("adapter")
    if not adapter:
        fn = scope[contract["entrypoint"]]
        mode = contract["inputMode"]
        return fn(**fixture) if mode == "kwargs" else fn(*fixture) if mode == "args" else fn(fixture)
    if adapter["id"] != "reasonai-python" or adapter["version"] != HARNESS_VERSION:
        raise ValueError("Unsupported invocation adapter version")
    if adapter["invocation"] == "design":
        operations, arguments = fixture["operations"], fixture["arguments"]
        if not isinstance(operations, list) or not 1 <= len(operations) <= 1000 or len(operations) != len(arguments) or operations[0] != adapter["className"]:
            raise ValueError("Invalid design-class operation sequence")
        constructors = _parameters(arguments[0], "args", adapter["parameters"], context)
        instance = scope[adapter["className"]](*constructors.values())
        output = [None]
        methods = {method["name"]: method for method in adapter.get("methods", [])}
        for name, args in zip(operations[1:], arguments[1:]):
            if name not in methods or name.startswith("_"):
                raise ValueError("Method is not part of the approved operation registry")
            method = methods[name]
            values = _parameters(args, "args", method["parameters"], context)
            result = getattr(instance, name)(*values.values())
            output.append(context.encode(result, method.get("resultCodec", "json")))
        return output
    parameters = adapter["parameters"]
    values = _parameters(fixture, contract["inputMode"], parameters, context)
    fn = (getattr(scope[adapter["className"]](), contract["entrypoint"])
          if adapter["invocation"] == "method" else scope[contract["entrypoint"]])
    result = fn(**values) if contract["inputMode"] == "kwargs" else fn(*values.values())
    selection = adapter["result"]
    value = values[selection["parameter"]] if selection["source"] == "parameter" else result
    if selection.get("prefixLengthFromReturn"):
        if type(result) is not int or result < 0 or result > len(value):
            raise SerializationError("Returned prefix length is invalid")
        value = value[:result]
    if selection["codec"] == "node_index" and selection.get("identityParameter") and value is not None:
        parameter = next(p for p in parameters if p["name"] == selection["identityParameter"])
        if id(value) not in {id(node) for node in context.tables.get(parameter.get("nodeTable"), [])}:
            raise SerializationError("Output node does not belong to the approved identity source")
    return context.encode(value, selection["codec"], selection.get("requireDetached", False))


def run_case(source, contract, fixture):
    """Return bounded actual evidence. Caller supplies NO expected result."""
    capture = BoundedOutput()
    try:
        with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
            actual = _invoke(source, contract, fixture)
            encoded = json.dumps(actual, allow_nan=False, separators=(",", ":"))
            if len(encoded.encode("utf-8")) > 16384:
                raise OutputLimitError("Serialized output exceeded the 16384-byte limit")
        return {"status": "ok", "actual": json.loads(encoded), "stdout": capture.getvalue()}
    except OutputLimitError as error:
        return {"status": "output_limit_exceeded", "stderr": str(error), "stdout": capture.getvalue()}
    except SyntaxError:
        return {"status": "syntax_error", "stderr": traceback.format_exc(limit=5)[-4096:], "stdout": capture.getvalue()}
    except BaseException:
        return {"status": "runtime_error", "stderr": traceback.format_exc(limit=5)[-4096:], "stdout": capture.getvalue()}
