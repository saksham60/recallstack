import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PythonController extends TextEditingController {
  PythonController({super.text});
  static final tokens = RegExp(
    r'''#[^\n]*|"[^"\n]*"|'[^'\n]*'|\b(?:def|class|if|elif|else|for|while|in|not|and|or|return|import|from|as|try|except|finally|raise|with|yield|pass|break|continue|True|False|None|self|lambda)\b|\b\d+(?:\.\d+)?\b''',
  );
  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    TextStyle? style,
    required bool withComposing,
  }) {
    if (withComposing &&
        value.composing.isValid &&
        !value.composing.isCollapsed) {
      return super.buildTextSpan(
        context: context,
        style: style,
        withComposing: withComposing,
      );
    }
    final spans = <TextSpan>[];
    var offset = 0;
    for (final match in tokens.allMatches(text)) {
      if (match.start > offset) {
        spans.add(TextSpan(text: text.substring(offset, match.start)));
      }
      final token = match.group(0)!;
      spans.add(
        TextSpan(
          text: token,
          style: TextStyle(
            color: token.startsWith('#')
                ? const Color(0xff8b8b99)
                : token.startsWith('"') || token.startsWith("'")
                ? const Color(0xffa3d9a5)
                : const Color(0xffb8a0ff),
          ),
        ),
      );
      offset = match.end;
    }
    spans.add(TextSpan(text: text.substring(offset)));
    return TextSpan(style: style, children: spans);
  }

  void insert(String text) {
    final selected = selection.isValid
        ? selection
        : TextSelection.collapsed(offset: this.text.length);
    value = TextEditingValue(
      text: this.text.replaceRange(selected.start, selected.end, text),
      selection: TextSelection.collapsed(offset: selected.start + text.length),
    );
  }

  void unindent() {
    final cursor = selection.isValid ? selection.start : text.length;
    final start = cursor == 0 ? 0 : text.lastIndexOf('\n', cursor - 1) + 1;
    final suffix = text.substring(start);
    final count = suffix.startsWith('    ')
        ? 4
        : suffix.startsWith('\t')
        ? 1
        : RegExp(r'^ {1,3}').firstMatch(suffix)?.end ?? 0;
    if (count == 0) return;
    value = TextEditingValue(
      text: text.replaceRange(start, start + count, ''),
      selection: TextSelection.collapsed(
        offset: math.max(start, cursor - count),
      ),
    );
  }
}

class PythonEditor extends StatefulWidget {
  const PythonEditor({
    super.key,
    required this.controller,
    required this.onChanged,
  });
  final PythonController controller;
  final VoidCallback onChanged;
  @override
  State<PythonEditor> createState() => _PythonEditorState();
}

class _PythonEditorState extends State<PythonEditor> {
  final undo = UndoHistoryController(), horizontal = ScrollController();
  final focus = FocusNode();
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(changed);
  }

  void changed() {
    widget.onChanged();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(changed);
    undo.dispose();
    horizontal.dispose();
    focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          const Expanded(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text('Python · UTF-8', overflow: TextOverflow.ellipsis),
            ),
          ),
          ValueListenableBuilder<UndoHistoryValue>(
            valueListenable: undo,
            builder: (context, value, child) => Row(
              children: [
                IconButton(
                  tooltip: 'Undo',
                  onPressed: value.canUndo ? undo.undo : null,
                  icon: const Icon(Icons.undo),
                ),
                IconButton(
                  tooltip: 'Redo',
                  onPressed: value.canRedo ? undo.redo : null,
                  icon: const Icon(Icons.redo),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Copy code',
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: widget.controller.text)),
            icon: const Icon(Icons.copy),
          ),
        ],
      ),
      Expanded(
        child: LayoutBuilder(
          builder: (context, size) {
            final lines = widget.controller.text.split('\n');
            final width = math.max(
              size.maxWidth - 48,
              lines.fold<int>(1, (m, l) => math.max(m, l.length)) * 8.5 + 32,
            );
            return SingleChildScrollView(
              child: Scrollbar(
                controller: horizontal,
                child: SingleChildScrollView(
                  controller: horizontal,
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 44,
                        child: Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Text(
                            List.generate(
                              lines.length,
                              (i) => '${i + 1}',
                            ).join('\n'),
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 14,
                              height: 1.5,
                              color: Colors.grey,
                            ),
                          ),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: TextField(
                          controller: widget.controller,
                          focusNode: focus,
                          undoController: undo,
                          maxLines: null,
                          maxLength: 24000,
                          autocorrect: false,
                          enableSuggestions: false,
                          textCapitalization: TextCapitalization.none,
                          smartDashesType: SmartDashesType.disabled,
                          smartQuotesType: SmartQuotesType.disabled,
                          keyboardType: TextInputType.multiline,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 14,
                            height: 1.5,
                          ),
                          decoration: const InputDecoration(
                            labelText: 'Python solution',
                            alignLabelWithHint: true,
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.all(16),
                            counterText: '',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final key in [
              'Tab',
              'Unindent',
              ':',
              '(',
              ')',
              '[',
              ']',
              '=',
              '_',
              '"',
              "'",
              '#',
            ])
              TextButton(
                onPressed: () {
                  if (key == 'Unindent') {
                    widget.controller.unindent();
                  } else {
                    widget.controller.insert(key == 'Tab' ? '    ' : key);
                  }
                  focus.requestFocus();
                },
                child: Text(key),
              ),
          ],
        ),
      ),
    ],
  );
}

String pythonStarter(
  Map<String, dynamic> capabilities,
  Map<String, dynamic> fallback,
) {
  final approved = capabilities['approvedContract'];
  final contract = approved is Map ? approved['contract'] : null;
  final adapter = contract is Map ? contract['adapter'] : null;
  if (contract is! Map || adapter is! Map) {
    return '# Follow the function contract shown in Description.\n';
  }
  String parameters(Object? value, {bool self = false}) {
    final params = (value as List? ?? [])
        .whereType<Map>()
        .map((p) => '${p['name']}: ${p['pythonType']}')
        .toList();
    return [if (self) 'self', ...params].join(', ');
  }

  final lines = [
    'from __future__ import annotations',
    'from typing import Any, Dict, List, Optional, Tuple',
    '',
  ];
  final invocation = adapter['invocation'];
  if (invocation == 'function') {
    lines.addAll([
      'def ${contract['entrypoint']}(${parameters(adapter['parameters'])}) -> ${adapter['returnType']}:',
      '    pass',
    ]);
  } else {
    lines.add('class ${adapter['className']}:');
    if (invocation == 'method') {
      lines.addAll([
        '    def ${contract['entrypoint']}(${parameters(adapter['parameters'], self: true)}) -> ${adapter['returnType']}:',
        '        pass',
      ]);
    } else {
      lines.addAll([
        '    def __init__(${parameters(adapter['parameters'], self: true)}) -> None:',
        '        pass',
      ]);
      for (final method
          in (adapter['methods'] as List? ?? []).whereType<Map>()) {
        lines.addAll([
          '',
          '    def ${method['name']}(${parameters(method['parameters'], self: true)}) -> ${method['returnType']}:',
          '        pass',
        ]);
      }
    }
  }
  return '${lines.join('\n')}\n';
}
