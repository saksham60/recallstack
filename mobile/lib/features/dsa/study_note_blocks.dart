import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/safe_url.dart';

class StudyNoteBlocks extends StatelessWidget {
  const StudyNoteBlocks({super.key, required this.blocks});
  final List<Map<String, dynamic>> blocks;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (final block in blocks)
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: _Block(block: block),
        ),
    ],
  );
}

class _Block extends StatefulWidget {
  const _Block({required this.block});
  final Map<String, dynamic> block;
  @override
  State<_Block> createState() => _BlockState();
}

class _BlockState extends State<_Block> {
  bool revealed = false;
  @override
  Widget build(BuildContext context) {
    final type = widget.block['type'] as String? ?? '';
    final heading = widget.block['heading'] as String?;
    final payload = widget.block['payload'] is Map
        ? Map<String, dynamic>.from(widget.block['payload'] as Map)
        : <String, dynamic>{};
    final text =
        (payload['content'] ??
                payload['markdown'] ??
                payload['text'] ??
                payload['description'] ??
                '')
            .toString()
            .replaceAll(RegExp(r'<[^>]*>'), '');
    final theme = Theme.of(context);
    final callout = [
      'warning',
      'remember',
      'mistake',
      'invariant',
    ].contains(type);
    Widget content;
    switch (type) {
      case 'code':
        final code = (payload['code'] ?? payload['text'] ?? '').toString();
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Copy code',
              onPressed: () => Clipboard.setData(ClipboardData(text: code)),
              icon: const Icon(Icons.copy),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SelectableText(
                code,
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ),
          ],
        );
      case 'table':
        final headers = (payload['headers'] as List? ?? [])
            .map((e) => e.toString())
            .toList();
        final rows = (payload['rows'] as List? ?? [])
            .whereType<List>()
            .toList();
        content = headers.isEmpty
            ? Text(text)
            : SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: headers
                      .map((e) => DataColumn(label: Text(e)))
                      .toList(),
                  rows: rows
                      .map(
                        (row) => DataRow(
                          cells: [
                            for (var i = 0; i < headers.length; i++)
                              DataCell(
                                Text(i < row.length ? row[i].toString() : ''),
                              ),
                          ],
                        ),
                      )
                      .toList(),
                ),
              );
      case 'quiz':
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text((payload['question'] ?? text).toString()),
            TextButton(
              onPressed: () => setState(() => revealed = !revealed),
              child: Text(revealed ? 'Hide answer' : 'Reveal answer'),
            ),
            if (revealed)
              Text(
                (payload['answer'] ?? payload['explanation'] ?? '').toString(),
              ),
          ],
        );
      case 'diagram':
        final nodes = (payload['nodes'] as List? ?? [])
            .whereType<Map>()
            .toList();
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (text.isNotEmpty) Text(text),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final node in nodes)
                  Chip(
                    label: Text(
                      node['label']?.toString() ??
                          node['id']?.toString() ??
                          'Node',
                    ),
                  ),
              ],
            ),
          ],
        );
      case 'architecture_flow':
        final steps = (payload['steps'] as List? ?? []);
        content = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (text.isNotEmpty) Text(text),
            for (var i = 0; i < steps.length; i++)
              ListTile(
                leading: CircleAvatar(child: Text('${i + 1}')),
                title: Text(
                  steps[i] is Map
                      ? (steps[i] as Map)['title']?.toString() ??
                            'Step ${i + 1}'
                      : steps[i].toString(),
                ),
              ),
          ],
        );
      case 'related_content':
        final references =
            payload['items'] as List? ?? payload['content'] as List? ?? [];
        content = Wrap(
          spacing: 8,
          children: [
            for (final item in references.whereType<Map>())
              if (item['slug'] is String)
                ActionChip(
                  label: Text(
                    item['title']?.toString() ?? item['slug'] as String,
                  ),
                  onPressed: () => context.push(
                    '/dsa/problems/${Uri.encodeComponent(item['slug'] as String)}',
                  ),
                ),
          ],
        );
      default:
        content = MarkdownBody(
          data: text,
          onTapLink: (_, href, _) => openExternal(context, href),
        );
    }
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (heading != null && heading.isNotEmpty) ...[
          Text(heading, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
        ],
        content,
      ],
    );
    if (!callout) return body;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color:
            (type == 'warning' || type == 'mistake'
                    ? theme.colorScheme.error
                    : theme.colorScheme.primary)
                .withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: body,
    );
  }
}
