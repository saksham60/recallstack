import 'package:app/features/catalog/data/catalog_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ProblemListScreen extends ConsumerWidget {
  final String categoryId;

  const ProblemListScreen({super.key, required this.categoryId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(catalogRepositoryProvider).watchContentItems(categoryId);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Problems'),
      ),
      body: StreamBuilder<List<ContentItemWithProgress>>(
        stream: itemsAsync,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final items = snapshot.data ?? [];
          if (items.isEmpty) {
            return _buildEmptyState(context);
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: items.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final content = items[index];
              return _ProblemListItem(content: content);
            },
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.list_alt_rounded, size: 64, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 16),
          Text(
            'No problems found.',
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ],
      ),
    );
  }
}

class _ProblemListItem extends StatelessWidget {
  final ContentItemWithProgress content;

  const _ProblemListItem({required this.content});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isMastered = content.progress?.status == 'mastered';
    
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: CircleAvatar(
        backgroundColor: _getDifficultyColor(content.item.difficulty, theme).withAlpha(40), // 0.15 * 255 = ~38
        child: Icon(
          isMastered ? Icons.check_circle : Icons.article_outlined,
          color: isMastered ? Colors.greenAccent : _getDifficultyColor(content.item.difficulty, theme),
        ),
      ),
      title: Text(
        content.item.title,
        style: theme.textTheme.titleMedium,
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 8.0),
        child: Row(
          children: [
            _buildBadge(
              context, 
              content.item.difficulty?.toUpperCase() ?? 'UNKNOWN',
              _getDifficultyColor(content.item.difficulty, theme)
            ),
            if (content.item.type != 'problem') ...[
              const SizedBox(width: 8),
              _buildBadge(context, content.item.type.toUpperCase(), theme.colorScheme.tertiary),
            ]
          ],
        ),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () {
        context.push('/content/${content.item.slug}');
      },
    );
  }

  Color _getDifficultyColor(String? difficulty, ThemeData theme) {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return Colors.green;
      case 'medium':
        return Colors.orange;
      case 'hard':
        return Colors.red;
      default:
        return theme.colorScheme.onSurfaceVariant;
    }
  }

  Widget _buildBadge(BuildContext context, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(25), // 0.1 * 255 = 25
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withAlpha(128)),
      ),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
