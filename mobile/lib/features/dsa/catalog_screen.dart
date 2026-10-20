import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_failure.dart';
import '../../shared/widgets/states.dart';
import '../../shared/theme/app_theme.dart';
import 'catalog_controller.dart';
import 'dsa_api.dart' show bookmarksProvider;

class DsaExplorerScreen extends ConsumerStatefulWidget {
  const DsaExplorerScreen({super.key});
  @override
  ConsumerState<DsaExplorerScreen> createState() => _DsaExplorerScreenState();
}

class _DsaExplorerScreenState extends ConsumerState<DsaExplorerScreen> {
  Timer? debounce;
  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(catalogControllerProvider);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, child) {
        final items = controller.visible;
        return Scaffold(
          appBar: AppBar(
            title: const Text('DSA'),
            actions: [
              IconButton(
                tooltip: 'Refresh catalog',
                onPressed: () {
                  controller.load();
                  controller.loadMetadata();
                },
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: const InputDecoration(
                    labelText: 'Search problems',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (value) {
                    debounce?.cancel();
                    debounce = Timer(const Duration(milliseconds: 350), () {
                      controller.search = value;
                      controller.load();
                    });
                  },
                ),
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    DropdownButton<String>(
                      value: controller.difficulty ?? '',
                      hint: const Text('Difficulty'),
                      items: [
                        const DropdownMenuItem(
                          value: '',
                          child: Text('All difficulties'),
                        ),
                        for (final value in [
                          'beginner',
                          'easy',
                          'medium',
                          'hard',
                          'expert',
                        ])
                          DropdownMenuItem(value: value, child: Text(value)),
                      ],
                      onChanged: (value) {
                        controller.difficulty = value == '' ? null : value;
                        controller.load();
                      },
                    ),
                    const SizedBox(width: 12),
                    DropdownButton<String>(
                      value: controller.category ?? '',
                      items: [
                        const DropdownMenuItem(
                          value: '',
                          child: Text('All categories'),
                        ),
                        for (final item in controller.categories)
                          DropdownMenuItem(
                            value: item['id'] as String,
                            child: Text(item['name'] as String),
                          ),
                      ],
                      onChanged: (value) {
                        controller.category = value == '' ? null : value;
                        controller.load();
                      },
                    ),
                    const SizedBox(width: 12),
                    TextButton.icon(
                      icon: const Icon(Icons.business),
                      label: Text(
                        controller.company.isEmpty
                            ? 'Company'
                            : controller.company,
                      ),
                      onPressed: () async {
                        await controller.loadAll();
                        if (!context.mounted) return;
                        final options = {
                          for (final c in controller.companies)
                            c['slug'] as String: c['name'] as String,
                        };
                        final selected = await showModalBottomSheet<String>(
                          context: context,
                          isScrollControlled: true,
                          builder: (context) => SafeArea(
                            child: SizedBox(
                              height: MediaQuery.sizeOf(context).height * 0.65,
                              child: ListView(
                                children: [
                                  ListTile(
                                    title: const Text('All companies'),
                                    onTap: () => Navigator.pop(context, ''),
                                  ),
                                  for (final key
                                      in (options.keys.toList()..sort()))
                                    ListTile(
                                      title: Text(options[key]!),
                                      onTap: () => Navigator.pop(context, key),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                        if (selected != null && !controller.disposed) {
                          controller.company = selected;
                          controller.emit();
                        }
                      },
                    ),
                    DropdownButton<String>(
                      value: controller.completion,
                      items: [
                        for (final pair in [
                          ('all', 'All statuses'),
                          ('solved', 'Solved'),
                          ('passed_current_tests', 'Passed current tests'),
                          ('attempted', 'Attempted'),
                          ('unsolved', 'Not yet passed'),
                          ('bookmarked', 'Bookmarked'),
                        ])
                          DropdownMenuItem(
                            value: pair.$1,
                            enabled:
                                pair.$1 == 'all' ||
                                (pair.$1 == 'bookmarked'
                                    ? controller.bookmarksError == null
                                    : controller.progressError == null),
                            child: Text(pair.$2),
                          ),
                      ],
                      onChanged: (value) {
                        controller.completion = value ?? 'all';
                        controller.emit();
                        controller.loadAll();
                      },
                    ),
                  ],
                ),
              ),
              if (controller.metadataError != null)
                MaterialBanner(
                  content: Text(controller.metadataWarning),
                  actions: [
                    TextButton(
                      onPressed: controller.retryBusy
                          ? null
                          : controller.retryMetadata,
                      child: Text(controller.retryBusy ? 'Retrying…' : 'Retry'),
                    ),
                  ],
                ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 6,
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${items.length} loaded matches${controller.hasMore ? ' · more available' : ''}',
                  ),
                ),
              ),
              if (controller.progress.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(
                      spacing: 16,
                      runSpacing: 4,
                      children: [
                        Text(
                          '${controller.progress.values.where((p) => p['executionStatus'] == 'solved').length} solved',
                          style: const TextStyle(color: AppColors.highlight),
                        ),
                        Text(
                          '${controller.progress.values.where((p) => p['executionStatus'] == 'passed_current_tests').length} passed current tests',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: controller.error != null && controller.problems.isEmpty
                    ? ErrorState(
                        error: controller.error!,
                        onRetry: () => controller.load(),
                      )
                    : controller.busy && controller.problems.isEmpty
                    ? const ListSkeleton()
                    : RefreshIndicator(
                        onRefresh: () async {
                          await Future.wait([
                            controller.load(),
                            controller.loadMetadata(),
                          ]);
                        },
                        child: NotificationListener<ScrollNotification>(
                          onNotification: (notice) {
                            if (notice.metrics.extentAfter < 300 &&
                                !controller.busy) {
                              controller.load(more: true);
                            }
                            return false;
                          },
                          child: ListView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: items.length + 1,
                            itemBuilder: (context, index) {
                              if (index == items.length) {
                                return Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: controller.busy
                                      ? const Center(
                                          child: CircularProgressIndicator(),
                                        )
                                      : controller.error != null
                                      ? TextButton(
                                          onPressed: () =>
                                              controller.load(more: true),
                                          child: const Text(
                                            'Retry loading problems',
                                          ),
                                        )
                                      : controller.hasMore
                                      ? TextButton(
                                          onPressed: () =>
                                              controller.load(more: true),
                                          child: const Text(
                                            'Load more problems',
                                          ),
                                        )
                                      : items.isEmpty
                                      ? const Center(
                                          child: Text(
                                            'No matching problems. Change a filter or refresh.',
                                          ),
                                        )
                                      : const SizedBox.shrink(),
                                );
                              }
                              final p = items[index];
                              return Card(
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 5,
                                ),
                                child: ListTile(
                                  title: Text(p.title),
                                  subtitle: Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${p.difficulty ?? 'Unrated'} · ${controller.progressError != null
                                              ? 'Progress unavailable'
                                              : controller.progressBusy && !controller.progress.containsKey(p.id)
                                              ? 'Loading progress…'
                                              : completionLabel(controller.progress[p.id], p.version)}',
                                        ),
                                        if (controller
                                            .companiesFor(p)
                                            .isNotEmpty)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              top: 6,
                                            ),
                                            child: Text(
                                              controller
                                                  .companiesFor(p)
                                                  .map((c) => c['name'])
                                                  .toSet()
                                                  .join(' · '),
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                color: AppColors.highlight,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                  trailing: IconButton(
                                    tooltip: 'Bookmark ${p.title}',
                                    icon: Icon(
                                      controller.bookmarks.contains(p.id)
                                          ? Icons.bookmark
                                          : Icons.bookmark_border,
                                    ),
                                    onPressed: controller.bookmarkPending(p)
                                        ? null
                                        : () async {
                                            try {
                                              await controller.toggleBookmark(
                                                p,
                                              );
                                              ref.invalidate(bookmarksProvider);
                                            } catch (e) {
                                              if (context.mounted) {
                                                ScaffoldMessenger.of(
                                                  context,
                                                ).showSnackBar(
                                                  SnackBar(
                                                    content: Text(
                                                      ApiFailure.from(
                                                        e,
                                                      ).userMessage,
                                                    ),
                                                  ),
                                                );
                                              }
                                            }
                                          },
                                  ),
                                  onTap: () async {
                                    await context.push(
                                      '/dsa/problems/${Uri.encodeComponent(p.slug)}?version=${p.version}',
                                    );
                                    if (!controller.disposed) {
                                      controller.loadMetadata();
                                    }
                                  },
                                ),
                              );
                            },
                          ),
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}
