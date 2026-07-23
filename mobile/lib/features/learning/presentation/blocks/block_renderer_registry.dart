import 'package:flutter/material.dart';

abstract class StudyBlockWidget extends StatelessWidget {
  final Map<String, dynamic> blockData;

  const StudyBlockWidget({super.key, required this.blockData});
}

class ContentBlockRendererRegistry {
  static Widget render(Map<String, dynamic> block) {
    final type = block['type'] as String?;

    switch (type) {
      case 'recognize':
      case 'remember':
      case 'invariant':
      case 'approach':
        return _TextBlockWidget(blockData: block);
      case 'code':
        return _CodeBlockWidget(blockData: block);
      case 'warning':
      case 'mistake':
        return _AlertBlockWidget(blockData: block);
      case 'diagram':
      case 'table':
      case 'architecture_flow':
      case 'quiz':
      case 'related_content':
        return _GenericPlaceholderBlockWidget(blockData: block);
      default:
        return _SafeUnsupportedBlockWidget(blockData: block);
    }
  }
}

class _TextBlockWidget extends StudyBlockWidget {
  const _TextBlockWidget({required super.blockData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = blockData['content'] as String? ?? '';
    final type = blockData['type'] as String? ?? 'text';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            type.toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            content,
            style: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
          ),
        ],
      ),
    );
  }
}

class _CodeBlockWidget extends StudyBlockWidget {
  const _CodeBlockWidget({required super.blockData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = blockData['content'] as String? ?? '';
    final language = blockData['language'] as String? ?? 'code';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12.0),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withAlpha(128),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(8),
              ),
            ),
            child: Text(
              language,
              style: theme.textTheme.labelSmall?.copyWith(
                fontFamily: 'monospace',
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: Text(
              content,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontFamily: 'monospace',
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertBlockWidget extends StudyBlockWidget {
  const _AlertBlockWidget({required super.blockData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = blockData['content'] as String? ?? '';
    final isWarning = blockData['type'] == 'warning';

    final color = isWarning ? Colors.orange : Colors.redAccent;
    final icon = isWarning ? Icons.warning_amber_rounded : Icons.error_outline;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12.0),
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: color.withAlpha(25),
        borderRadius: BorderRadius.circular(8),
        border: Border(
          left: BorderSide(color: color, width: 4),
          top: BorderSide(color: color.withAlpha(128)),
          right: BorderSide(color: color.withAlpha(128)),
          bottom: BorderSide(color: color.withAlpha(128)),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              content,
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _GenericPlaceholderBlockWidget extends StudyBlockWidget {
  const _GenericPlaceholderBlockWidget({required super.blockData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = blockData['type'] as String? ?? 'unknown';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withAlpha(50),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.widgets_outlined,
                color: theme.colorScheme.primary,
                size: 20,
              ),
              const SizedBox(width: 8),
              Text(
                '${type.toUpperCase()} BLOCK',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'This block type is recognized but rendering is simplified in this version.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _SafeUnsupportedBlockWidget extends StudyBlockWidget {
  const _SafeUnsupportedBlockWidget({required super.blockData});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = blockData['type'] as String? ?? 'unknown';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8.0),
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: theme.colorScheme.outlineVariant,
          style: BorderStyle.solid,
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.extension,
            color: theme.colorScheme.onSurfaceVariant,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Unsupported block type: $type',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
