import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/api/safe_url.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../../../shared/widgets/states.dart';
import 'feed_api.dart';
import 'feed_controller.dart';
import 'feed_models.dart';
import 'story_chat_sheet.dart';

class StoryDetailScreen extends ConsumerStatefulWidget {
  const StoryDetailScreen({super.key, required this.storyId});
  final String storyId;
  @override
  ConsumerState<StoryDetailScreen> createState() => _StoryDetailScreenState();
}

class _StoryDetailScreenState extends ConsumerState<StoryDetailScreen> {
  bool? savedOverride;
  bool saving = false;
  @override
  void initState() {
    super.initState();
    unawaited(
      ref
          .read(feedApiProvider)
          .event(widget.storyId, 'OPEN')
          .catchError((Object _) {}),
    );
  }

  Future<void> _save(Story story) async {
    if (saving) return;
    final original = savedOverride ?? story.saved;
    setState(() {
      saving = true;
      savedOverride = !original;
    });
    final ok = await ref
        .read(feedControllerProvider.notifier)
        .toggleSave(story.withSaved(original));
    if (!ok && mounted) {
      setState(() => savedOverride = original);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not update saved story.')),
      );
    }
    ref.invalidate(storyProvider(widget.storyId));
    if (mounted) setState(() => saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final story = ref.watch(storyProvider(widget.storyId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Story'),
        actions: story.value == null
            ? null
            : [
                IconButton(
                  tooltip: (savedOverride ?? story.value!.saved)
                      ? 'Unsave'
                      : 'Save',
                  onPressed: saving ? null : () => _save(story.value!),
                  icon: Icon(
                    (savedOverride ?? story.value!.saved)
                        ? Icons.bookmark
                        : Icons.bookmark_outline,
                  ),
                ),
                IconButton(
                  tooltip: 'Share',
                  icon: const Icon(Icons.share_outlined),
                  onPressed: () async {
                    final item = story.value!;
                    await SharePlus.instance.share(
                      ShareParams(
                        text:
                            '${item.title}\n${safeHttpUrl(item.sourceUrl) ?? ''}',
                      ),
                    );
                    unawaited(
                      ref
                          .read(feedApiProvider)
                          .event(item.id, 'SHARE')
                          .catchError((Object _) {}),
                    );
                  },
                ),
                PopupMenuButton<String>(
                  tooltip: 'More',
                  onSelected: (value) async {
                    if (value != 'hide') return;
                    final item = story.value!;
                    final controller = ref.read(
                      feedControllerProvider.notifier,
                    );
                    final ok = await controller.hide(item);
                    if (!context.mounted) return;
                    if (ok) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: const Text('Story hidden'),
                          action: SnackBarAction(
                            label: 'Undo',
                            onPressed: () => controller.undoHide(item),
                          ),
                        ),
                      );
                      Navigator.of(context).pop();
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Could not hide story.')),
                      );
                    }
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'hide', child: Text('Not interested')),
                  ],
                ),
              ],
      ),
      body: story.when(
        loading: () => ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            SkeletonBox(height: 18),
            SizedBox(height: 16),
            SkeletonBox(height: 68),
            SizedBox(height: 16),
            SkeletonBox(height: 190),
          ],
        ),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(storyProvider(widget.storyId)),
        ),
        data: (item) => ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.sourceName,
                    style: Theme.of(context).textTheme.labelLarge,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  item.ageLabel(),
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(item.title, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            AppNetworkImage(url: item.imageUrl, aspectRatio: 16 / 9),
            const SizedBox(height: 24),
            Text('Summary', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(item.summary),
            const SizedBox(height: 24),
            Text(
              'Why it matters',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 3,
                  height: 56,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(item.whyItMatters)),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final topic in item.topics) Chip(label: Text(topic)),
              ],
            ),
            const SizedBox(height: 20),
            if (safeHttpUrl(item.sourceUrl) != null)
              TextButton.icon(
                onPressed: () => openExternal(context, item.sourceUrl),
                icon: const Icon(Icons.open_in_new),
                label: const Text('Read source'),
              ),
          ],
        ),
      ),
      bottomNavigationBar: story.value == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton.icon(
                  onPressed: () => showStoryChat(context, story.value!),
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('Ask ReasonAI'),
                ),
              ),
            ),
    );
  }
}
