import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/api/safe_url.dart';

/// Shared reading hierarchy for user notes, statements, and AI explanations.
class ReadingContent extends StatelessWidget {
  const ReadingContent({super.key, required this.data});
  final String data;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MarkdownBody(
      data: data,
      selectable: true,
      onTapLink: (_, href, _) => openExternal(context, href),
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: theme.textTheme.bodyMedium?.copyWith(height: 1.6),
        h1: theme.textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w700,
        ),
        h2: theme.textTheme.titleLarge,
        h3: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        blockSpacing: 12,
        listIndent: 20,
        codeblockPadding: const EdgeInsets.all(12),
        codeblockDecoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        blockquoteDecoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: theme.colorScheme.primary, width: 3),
          ),
        ),
      ),
    );
  }
}
