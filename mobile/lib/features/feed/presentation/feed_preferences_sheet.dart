import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_failure.dart';
import 'feed_api.dart';
import 'feed_controller.dart';
import 'feed_models.dart';

final feedPreferencesProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
      (ref) => ref.watch(feedApiProvider).preferences(),
    );
Future<void> openFeedPreferences(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const FeedPreferencesSheet(),
    );

class FeedPreferencesSheet extends ConsumerStatefulWidget {
  const FeedPreferencesSheet({super.key});
  @override
  ConsumerState<FeedPreferencesSheet> createState() =>
      _FeedPreferencesSheetState();
}

class _FeedPreferencesSheetState extends ConsumerState<FeedPreferencesSheet> {
  final prompt = TextEditingController();
  Set<String>? selected;
  Set<String>? initialTopics;
  String initialPrompt = '';
  bool saving = false;
  String? error;
  @override
  void dispose() {
    prompt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(feedPreferencesProvider);
    return AnimatedPadding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      duration: const Duration(milliseconds: 180),
      child: SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.78,
          child: prefs.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) =>
                Center(child: Text(ApiFailure.from(e).userMessage)),
            data: (value) {
              if (selected == null) {
                selected = {
                  for (final item in (value['topics'] as List? ?? []))
                    if (item is Map && item['blocked'] != true)
                      item['topic'] as String,
                };
                initialTopics = {...selected!};
                initialPrompt = value['interestPrompt'] as String? ?? '';
                prompt.text = initialPrompt;
              }
              return Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tune your feed',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                for (final topic in feedTopics.entries.where(
                                  (entry) => entry.key.isNotEmpty,
                                ))
                                  FilterChip(
                                    label: Text(topic.value),
                                    selected: selected!.contains(topic.key),
                                    onSelected: (on) => setState(
                                      () => on
                                          ? selected!.add(topic.key)
                                          : selected!.remove(topic.key),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: prompt,
                              maxLength: 500,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                labelText: 'Tell ReasonAI what you care about',
                              ),
                            ),
                            if (error != null)
                              Text(
                                error!,
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.error,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: saving
                            ? null
                            : () async {
                                setState(() {
                                  saving = true;
                                  error = null;
                                });
                                try {
                                  final topicsChanged =
                                      selected!.length !=
                                          initialTopics!.length ||
                                      !selected!.containsAll(initialTopics!);
                                  final promptChanged =
                                      prompt.text != initialPrompt;
                                  if (topicsChanged || promptChanged) {
                                    await ref
                                        .read(feedApiProvider)
                                        .patchPreferences(
                                          topics: topicsChanged
                                              ? selected!.toList()
                                              : null,
                                          interestPrompt: promptChanged
                                              ? prompt.text
                                              : null,
                                        );
                                    ref.invalidate(feedPreferencesProvider);
                                    await ref
                                        .read(feedControllerProvider.notifier)
                                        .refresh();
                                  }
                                  if (context.mounted) {
                                    Navigator.of(context).pop();
                                  }
                                } catch (e) {
                                  if (mounted) {
                                    setState(
                                      () => error = ApiFailure.from(
                                        e,
                                      ).userMessage,
                                    );
                                  }
                                } finally {
                                  if (mounted) setState(() => saving = false);
                                }
                              },
                        child: const Text('Save'),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
