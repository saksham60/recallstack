import 'package:app/features/catalog/data/catalog_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/shared/theme/app_colors.dart';

final dsaCategoriesProvider =
    StreamProvider.family<List<CategoryWithStats>, String>((ref, domainId) {
      return ref.watch(catalogRepositoryProvider).watchCategories(domainId);
    });

class DSACategoryScreen extends ConsumerWidget {
  const DSACategoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Assuming 'dsa' is the domain ID
    final categoriesAsync = ref.watch(dsaCategoriesProvider('dsa'));

    return Scaffold(
      appBar: AppBar(
        title: const Text('DSA Categories', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
      ),
      body: categoriesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (categories) {
          if (categories.isEmpty) {
            return _buildEmptyState(context);
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: categories.length,
            itemBuilder: (context, index) {
              final item = categories[index];
              return _CategoryCard(item: item);
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
          Icon(
            Icons.inbox,
            size: 64,
            color: Theme.of(context).colorScheme.outline,
          ),
          const SizedBox(height: 16),
          Text(
            'No categories synced yet.',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text('Wait for sync to complete or check connection.'),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  final CategoryWithStats item;

  const _CategoryCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Calculate progress percentage
    double progress = 0;
    if (item.totalContent > 0) {
      progress =
          (item.masteredCount + item.learningCount * 0.5) / item.totalContent;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          context.push('/categories/${item.category.id}');
        },
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.category.title,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (item.category.description?.isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.only(top: 8.0),
                  child: Text(
                    item.category.description!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _StatBadge(
                    label: '${item.totalContent} Items',
                    icon: Icons.list_alt,
                  ),
                  _StatBadge(
                    label: '${item.masteredCount} Mastered',
                    icon: Icons.check_circle_outline,
                    color: AppColors.success,
                  ),
                  _StatBadge(
                    label: '${item.learningCount} Learning',
                    icon: Icons.sync,
                    color: AppColors.warning,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: AppColors.surfaceElevated,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color? color;

  const _StatBadge({required this.label, required this.icon, this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 14,
          color: color ?? AppColors.textSecondary,
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: color ?? AppColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
