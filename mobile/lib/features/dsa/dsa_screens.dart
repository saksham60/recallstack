import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_failure.dart';
import '../../core/api/safe_url.dart';
import '../../core/db/app_database.dart';
import '../../shared/widgets/states.dart';
import 'dsa_api.dart';
import 'dsa_models.dart';
import 'dsa_tutor_sheet.dart';
import 'study_note_blocks.dart';

class DsaCategoriesScreen extends ConsumerWidget {
  const DsaCategoriesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('DSA')),
      body: state.when(
        loading: () => const ListSkeleton(itemHeight: 142),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(categoriesProvider),
        ),
        data: (categories) => categories.isEmpty
            ? const EmptyState(
                icon: Icons.code,
                title: 'No categories yet',
                body: 'Check back when DSA content is published.',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: categories.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final c = categories[index];
                  final percent = (c['progress_percentage'] as num? ?? 0)
                      .toDouble()
                      .clamp(0, 100);
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => context.push(
                        '/dsa/categories/${Uri.encodeComponent(c['id'] as String)}'
                        '?name=${Uri.encodeComponent(c['name'] as String? ?? '')}',
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    c['name'] as String? ?? '',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                ),
                                const Icon(Icons.chevron_right),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              c['description'] as String? ?? '',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 8),
                            LinearProgressIndicator(value: percent / 100),
                            const SizedBox(height: 6),
                            Text(
                              '${c['mastered_count'] ?? 0}/${c['total_content_items'] ?? 0} mastered',
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class DsaProblemListScreen extends ConsumerWidget {
  const DsaProblemListScreen({super.key, required this.categoryId, this.name});
  final String categoryId;
  final String? name;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(categoryContentProvider(categoryId));
    return Scaffold(
      appBar: AppBar(title: Text(name ?? 'Problems')),
      body: state.when(
        loading: () => const ListSkeleton(itemHeight: 90),
        error: (e, _) => ErrorState(
          error: e,
          onRetry: () => ref.invalidate(categoryContentProvider(categoryId)),
        ),
        data: (items) => items.isEmpty
            ? const EmptyState(
                icon: Icons.code_off,
                title: 'No problems yet',
                body: 'This category has no published content.',
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  final progress = item['user_progress'] as Map? ?? {};
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(item['title'] as String? ?? ''),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            if (item['difficulty'] != null)
                              Chip(
                                label: Text(item['difficulty'].toString()),
                                backgroundColor: _difficultyColor(
                                  item['difficulty'] as String?,
                                ).withValues(alpha: 0.15),
                              ),
                            Chip(
                              avatar: Icon(
                                Icons.circle,
                                size: 10,
                                color: progress['status'] == 'mastered'
                                    ? Colors.green
                                    : Colors.grey,
                              ),
                              label: Text(
                                progress['status']?.toString() ?? 'not started',
                              ),
                            ),
                            if (item['is_bookmarked'] == true)
                              const Icon(Icons.bookmark, size: 18),
                          ],
                        ),
                      ),
                      onTap: () => context.push(
                        '/dsa/problems/${Uri.encodeComponent(item['slug'] as String)}',
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class DsaProblemScreen extends ConsumerStatefulWidget {
  const DsaProblemScreen({super.key, required this.slug});
  final String slug;
  @override
  ConsumerState<DsaProblemScreen> createState() => _DsaProblemScreenState();
}

class _DsaProblemScreenState extends ConsumerState<DsaProblemScreen> {
  final approach = TextEditingController(), code = TextEditingController();
  Timer? saveTimer;
  AppDatabase? db;
  String? loadedId;
  bool? bookmarkOverride;
  bool bookmarking = false;
  @override
  void dispose() {
    saveTimer?.cancel();
    if (loadedId != null && db != null) {
      unawaited(db!.upsertDraft(loadedId!, approach.text, code.text));
    }
    approach.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> _loadDraft(StudyNote note) async {
    db = ref.read(appDatabaseProvider);
    final draft = await db!.getDraft(note.id);
    if (!mounted || loadedId != note.id) return;
    approach.text = draft?.approach ?? '';
    code.text = draft?.code ?? '';
  }

  void _scheduleSave() {
    saveTimer?.cancel();
    saveTimer = Timer(const Duration(milliseconds: 500), () {
      if (loadedId != null) {
        db?.upsertDraft(loadedId!, approach.text, code.text);
      }
    });
  }

  Future<void> _toggleBookmark(StudyNote note) async {
    if (bookmarking) return;
    final original = bookmarkOverride ?? note.bookmarked;
    setState(() {
      bookmarking = true;
      bookmarkOverride = !original;
    });
    try {
      await ref.read(dsaApiProvider).setBookmark(note.id, !original);
      ref.invalidate(bookmarksProvider);
      ref.invalidate(studyNoteProvider(widget.slug));
    } catch (e) {
      if (mounted) {
        setState(() => bookmarkOverride = original);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiFailure.from(e).userMessage)));
      }
    } finally {
      if (mounted) setState(() => bookmarking = false);
    }
  }

  Future<void> _practice(StudyNote note) async {
    final resource = note.primaryResource;
    if (resource == null || safeHttpUrl(resource['url'] as String?) == null) {
      return;
    }
    final opened = await openExternal(context, resource['url'] as String?);
    if (!mounted || !opened) return;
    const outcomes = <String, String>{
      'solved_independently': 'Solved independently',
      'solved_with_hint': 'Solved with a hint',
      'understood_but_could_not_code': 'Understood, could not code',
      'pattern_not_identified': 'Pattern not identified',
      'skipped': 'Skipped',
    };
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(title: Text('How did practice go?')),
            for (final entry in outcomes.entries)
              ListTile(
                title: Text(entry.value),
                onTap: () => Navigator.pop(context, entry.key),
              ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    try {
      await ref
          .read(dsaApiProvider)
          .practiceAttempt(
            note.id,
            selected,
            hintUsed: selected == 'solved_with_hint',
          );
      ref.invalidate(studyNoteProvider(widget.slug));
      ref.invalidate(dueReviewsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiFailure.from(e).userMessage)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(studyNoteProvider(widget.slug));
    return state.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Problem')),
        body: const ListSkeleton(itemHeight: 112),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorState(
          error: e,
          onRetry: () => ref.invalidate(studyNoteProvider(widget.slug)),
        ),
      ),
      data: (note) {
        if (loadedId != note.id) {
          loadedId = note.id;
          Future.microtask(() => _loadDraft(note));
        }
        final saved = bookmarkOverride ?? note.bookmarked;
        return DefaultTabController(
          length: 4,
          child: Scaffold(
            appBar: AppBar(
              title: Text(
                note.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              actions: [
                IconButton(
                  tooltip: saved ? 'Remove bookmark' : 'Bookmark',
                  onPressed: bookmarking ? null : () => _toggleBookmark(note),
                  icon: Icon(saved ? Icons.bookmark : Icons.bookmark_outline),
                ),
              ],
              bottom: const TabBar(
                isScrollable: true,
                tabs: [
                  Tab(text: 'Problem'),
                  Tab(text: 'Approach'),
                  Tab(text: 'Code'),
                  Tab(text: 'Notes'),
                ],
              ),
            ),
            body: TabBarView(
              children: [
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        if (note.difficulty != null)
                          Chip(
                            label: Text(note.difficulty!),
                            backgroundColor: _difficultyColor(
                              note.difficulty,
                            ).withValues(alpha: 0.15),
                          ),
                        Chip(label: Text(note.type)),
                        if (note.data['user_progress'] is Map)
                          Chip(
                            label: Text(
                              (note.data['user_progress'] as Map)['status']
                                      ?.toString() ??
                                  'not started',
                            ),
                          ),
                        for (final c
                            in (note.data['categories'] as List? ?? [])
                                .whereType<Map>())
                          Chip(label: Text(c['name']?.toString() ?? '')),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (note.data['summary'] is String)
                      Text(note.data['summary'] as String),
                    const SizedBox(height: 20),
                    StudyNoteBlocks(blocks: note.blocks),
                    if (note.primaryResource != null)
                      OutlinedButton.icon(
                        onPressed: () => _practice(note),
                        icon: const Icon(Icons.open_in_new),
                        label: Text(
                          'Practice on ${note.primaryResource!['provider_name']}',
                        ),
                      ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: TextField(
                    controller: approach,
                    onChanged: (_) => _scheduleSave(),
                    expands: true,
                    maxLines: null,
                    minLines: null,
                    textAlignVertical: TextAlignVertical.top,
                    decoration: const InputDecoration(
                      hintText: 'Write your approach...',
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: 'Copy code',
                          icon: const Icon(Icons.copy),
                          onPressed: () =>
                              Clipboard.setData(ClipboardData(text: code.text)),
                        ),
                      ),
                      Expanded(
                        child: TextField(
                          controller: code,
                          onChanged: (_) => _scheduleSave(),
                          expands: true,
                          maxLines: null,
                          minLines: null,
                          autocorrect: false,
                          style: const TextStyle(fontFamily: 'monospace'),
                          textAlignVertical: TextAlignVertical.top,
                          decoration: const InputDecoration(
                            hintText: 'Write your code...',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                _NotesTab(contentId: note.id),
              ],
            ),
            bottomNavigationBar: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  onPressed: () => showDsaTutor(
                    context,
                    note,
                    approach: approach.text,
                    code: code.text,
                  ),
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('Ask ReasonAI'),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _NotesTab extends ConsumerWidget {
  const _NotesTab({required this.contentId});
  final String contentId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notesProvider(contentId));
    return Column(
      children: [
        Expanded(
          child: state.when(
            loading: () => const ListSkeleton(itemHeight: 72),
            error: (e, _) => ErrorState(
              error: e,
              onRetry: () => ref.invalidate(notesProvider(contentId)),
            ),
            data: (notes) => notes.isEmpty
                ? const EmptyState(
                    icon: Icons.notes,
                    title: 'No notes yet',
                    body: 'Capture an insight or mistake while you practice.',
                  )
                : ListView.builder(
                    itemCount: notes.length,
                    itemBuilder: (_, i) {
                      final note = notes[i];
                      return Card(
                        margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: ListTile(
                          title: Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Chip(
                                label: Text(note['kind']?.toString() ?? 'note'),
                              ),
                              Text(
                                _relativeTime(note['updated_at']),
                                style: Theme.of(context).textTheme.labelSmall,
                              ),
                            ],
                          ),
                          subtitle: Text(note['body']?.toString() ?? ''),
                        ),
                      );
                    },
                  ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _addNote(context, ref, contentId),
              icon: const Icon(Icons.add),
              label: const Text('Add note'),
            ),
          ),
        ),
      ],
    );
  }
}

Future<void> _addNote(BuildContext context, WidgetRef ref, String id) async {
  final text = TextEditingController();
  var kind = 'note';
  var busy = false;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setState) => Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          MediaQuery.viewInsetsOf(sheet).bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButton<String>(
              value: kind,
              isExpanded: true,
              items: [
                'note',
                'mistake',
                'insight',
              ].map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
              onChanged: busy
                  ? null
                  : (value) => setState(() => kind = value ?? 'note'),
            ),
            TextField(
              controller: text,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Your note'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      if (text.text.trim().isEmpty) return;
                      setState(() => busy = true);
                      try {
                        await ref
                            .read(dsaApiProvider)
                            .addNote(id, kind, text.text.trim());
                        ref.invalidate(notesProvider(id));
                        if (sheet.mounted) Navigator.pop(sheet);
                      } catch (e) {
                        if (sheet.mounted) {
                          ScaffoldMessenger.of(sheet).showSnackBar(
                            SnackBar(
                              content: Text(ApiFailure.from(e).userMessage),
                            ),
                          );
                        }
                      } finally {
                        if (sheet.mounted) setState(() => busy = false);
                      }
                    },
              child: const Text('Save note'),
            ),
          ],
        ),
      ),
    ),
  );
  text.dispose();
}

Color _difficultyColor(String? value) => switch (value?.toLowerCase()) {
  'easy' => Colors.green,
  'medium' => Colors.amber,
  'hard' => Colors.red,
  _ => Colors.grey,
};
String _relativeTime(Object? value) {
  final date = DateTime.tryParse(value?.toString() ?? '');
  if (date == null) return '';
  final hours = DateTime.now().difference(date).inHours;
  if (hours < 1) return 'Just now';
  if (hours < 24) return '${hours}h ago';
  return '${hours ~/ 24}d ago';
}
