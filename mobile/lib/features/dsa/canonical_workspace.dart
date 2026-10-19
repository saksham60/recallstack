import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_failure.dart';
import '../../core/db/app_database.dart';
import '../../shared/widgets/states.dart';
import 'canonical_api.dart';
import 'canonical_models.dart';
import 'dsa_models.dart';
import 'dsa_tutor_sheet.dart';
import 'execution_session.dart';
import 'python_editor.dart';
import 'report_view.dart';

class CanonicalWorkspace extends ConsumerStatefulWidget {
  const CanonicalWorkspace({super.key, required this.slug, this.version});
  final String slug;
  final String? version;
  @override
  ConsumerState<CanonicalWorkspace> createState() => _CanonicalWorkspaceState();
}

class _CanonicalWorkspaceState extends ConsumerState<CanonicalWorkspace>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final tabs = TabController(length: 4, vsync: this);
  final code = PythonController(), approach = TextEditingController();
  Problem? problem;
  AppDatabase? db;
  CanonicalDsaApi? api;
  ExecutionSession? session;
  Json capabilities = {};
  List<Json> tests = [];
  List<Execution> history = [];
  Json? historyCursor;
  Object? error, capabilityError, historyError;
  String? draftError;
  bool loading = true, historyBusy = false, cached = false, ready = false;
  Timer? saveTimer;
  CancelToken? loadToken, historyToken;
  int generation = 0;
  String get cacheKey =>
      'problem:${widget.slug}:${widget.version ?? 'current'}';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.microtask(load);
  }

  @override
  void dispose() {
    generation++;
    WidgetsBinding.instance.removeObserver(this);
    saveTimer?.cancel();
    loadToken?.cancel();
    historyToken?.cancel();
    session?.dispose();
    unawaited(save());
    code.dispose();
    approach.dispose();
    tabs.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      session?.resume();
    } else {
      session?.pause();
      unawaited(save());
    }
  }

  Future<void> load() async {
    final current = ++generation;
    final active = loadToken = CancelToken();
    setState(() {
      loading = true;
      error = null;
    });
    api = ref.read(canonicalDsaApiProvider);
    db = ref.read(appDatabaseProvider);
    try {
      Problem p;
      try {
        p = await api!.problem(
          widget.slug,
          version: widget.version,
          token: active,
        );
        await db!.writeRecord(cacheKey, jsonEncode(p.data));
        cached = false;
      } catch (e) {
        final stored = await db!.readRecord(cacheKey);
        if (stored == null) rethrow;
        p = Problem.parse(jsonDecode(stored));
        cached = true;
      }
      if (!mounted || current != generation) return;
      problem = p;
      try {
        capabilities = await api!.capabilities(p, token: active);
        capabilityError = null;
      } catch (e) {
        capabilityError = e;
        capabilities = {};
      }
      try {
        tests = await api!.tests(p, token: active);
      } catch (_) {
        tests = [];
      }
      final draft = await db!.getDraft(p.draftKey);
      if (!mounted || current != generation) return;
      code.text = draft?.code ?? pythonStarter(capabilities, p.contract);
      approach.text = draft?.approach ?? '';
      session?.dispose();
      session = ExecutionSession(
        api!,
        db!,
        p,
        onTerminal: () {
          if (mounted) {
            ref.invalidate(canonicalProgressProvider);
            loadHistory();
          }
        },
      );
      ready = true;
      await session!.restore();
      if (!mounted || current != generation) return;
      unawaited(loadHistory());
      setState(() => loading = false);
    } catch (e) {
      if (mounted && current == generation) {
        setState(() {
          error = e;
          loading = false;
        });
      }
    }
  }

  void scheduleSave() {
    if (!ready) return;
    saveTimer?.cancel();
    saveTimer = Timer(const Duration(milliseconds: 500), save);
  }

  Future<void> save() async {
    final p = problem, database = db;
    if (!ready || p == null || database == null) return;
    final text = code.text, notes = approach.text;
    try {
      await database.upsertDraft(p.draftKey, notes, text);
      if (mounted && draftError != null) setState(() => draftError = null);
    } catch (_) {
      if (mounted) {
        setState(
          () => draftError =
              'Draft could not be saved on this device. Copy your code before leaving.',
        );
      }
    }
  }

  Future<void> loadHistory({bool more = false}) async {
    if (problem == null || historyBusy || (more && historyCursor == null)) {
      return;
    }
    final p = problem!, owner = api!;
    final active = historyToken = CancelToken();
    setState(() {
      historyBusy = true;
      historyError = null;
    });
    try {
      final result = await owner.history(
        p,
        cursor: more ? historyCursor : null,
        token: active,
      );
      for (final row in result.items) {
        row.requireScope(p);
      }
      if (!mounted || active.isCancelled) return;
      final seen = more ? history.map((j) => j.id).toSet() : <String>{};
      setState(() {
        history = [
          if (more) ...history,
          ...result.items.where((j) => seen.add(j.id)),
        ];
        historyCursor = result.next;
      });
    } catch (e) {
      if (mounted && !active.isCancelled) setState(() => historyError = e);
    } finally {
      if (mounted) setState(() => historyBusy = false);
    }
  }

  Future<void> execute(String mode) async {
    if (session == null || session!.active) return;
    FocusScope.of(context).unfocus();
    await save();
    if (!mounted) return;
    tabs.animateTo(2);
    await session!.start(code.text, mode);
  }

  Future<void> review(Execution job) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.92,
        child: SubmissionDetails(
          api: api!,
          problem: problem!,
          initial: job,
          onDiscuss: (id, source) =>
              tutor(submissionId: id, submittedSource: source),
        ),
      ),
    );
  }

  void tutor({String? submissionId, String? submittedSource}) {
    final p = problem;
    if (p == null || !mounted) return;
    final note = StudyNote({
      'content_item_id': p.id,
      'slug': p.slug,
      'title': p.title,
      'type': 'problem',
      'blocks': <Json>[],
      'practice_resources': <Json>[],
    });
    showDsaTutor(
      context,
      note,
      approach: approach.text,
      code: submittedSource ?? code.text,
      canonicalContext: p.tutorContext(
        approach.text,
        submittedSource ?? code.text,
        submissionId: submissionId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('DSA workspace')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (error != null || problem == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Problem unavailable')),
        body: Column(
          children: [
            Expanded(
              child: ErrorState(
                error: error ?? const FormatException('Missing problem'),
                onRetry: load,
              ),
            ),
            TextButton(
              onPressed: () => context.push(
                '/dsa/study/${Uri.encodeComponent(widget.slug)}',
              ),
              child: const Text('Open legacy study note'),
            ),
          ],
        ),
      );
    }
    final p = problem!, execution = session!;
    return ListenableBuilder(
      listenable: execution,
      builder: (context, child) => Scaffold(
        appBar: AppBar(
          title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(
              tooltip: 'Ask ReasonAI',
              onPressed: tutor,
              icon: const Icon(Icons.auto_awesome),
            ),
          ],
          bottom: TabBar(
            controller: tabs,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: const [
              Tab(text: 'Description'),
              Tab(text: 'Editor'),
              Tab(text: 'Results'),
              Tab(text: 'Submissions & AI'),
            ],
          ),
        ),
        body: Column(
          children: [
            if (cached)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Text(
                  'Cached statement. Connect to verify the current execution contract.',
                ),
              ),
            if (draftError != null) Text(draftError!),
            Expanded(
              child: TabBarView(
                controller: tabs,
                children: [
                  ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(
                        p.difficulty ?? 'Unrated',
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                      MarkdownBody(data: p.description, selectable: true),
                      const SizedBox(height: 16),
                      const Text('Function contract'),
                      SelectableText(
                        pretty(p.contract),
                        style: const TextStyle(fontFamily: 'monospace'),
                      ),
                      const SizedBox(height: 16),
                      const Text('Constraints'),
                      for (final constraint in p.constraints)
                        Text('• $constraint'),
                      const SizedBox(height: 16),
                      const Text('Examples'),
                      for (final example in p.examples)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: SelectableText(
                              'Input: ${pretty(example['input'])}\nOutput: ${pretty(example['output'])}\n${example['explanation'] ?? ''}',
                            ),
                          ),
                        ),
                      ExpansionTile(
                        title: const Text('Starter code reference'),
                        children: [
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SelectableText(
                              pythonStarter(capabilities, p.contract),
                              style: const TextStyle(fontFamily: 'monospace'),
                            ),
                          ),
                        ],
                      ),
                      const Text('Public test cases'),
                      for (final test in tests)
                        SelectableText(
                          'Input: ${pretty(test['input_json'])}\nExpected: ${pretty(test['expected_output_json'])}',
                        ),
                      if (tests.isEmpty)
                        const Text(
                          'No public cases were returned. Run/Submit availability follows the server capability response.',
                        ),
                      TextField(
                        controller: approach,
                        onChanged: (_) => scheduleSave(),
                        maxLines: 4,
                        maxLength: 12000,
                        decoration: const InputDecoration(
                          labelText: 'Your approach (saved on this device)',
                        ),
                      ),
                    ],
                  ),
                  PythonEditor(controller: code, onChanged: scheduleSave),
                  ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      if (execution.job == null)
                        const Text(
                          'Run checks public cases on the server. Submit judges the server-owned suite. A local Run is optional.',
                        ),
                      if (execution.job != null)
                        ExecutionCard(job: execution.job!),
                      if (execution.busy) const LinearProgressIndicator(),
                      if (execution.error != null) Text(execution.error!),
                      if (execution.pending != null)
                        FilledButton(
                          onPressed: execution.busy
                              ? null
                              : execution.retryCreate,
                          child: const Text(
                            'Retry saved request (same code/key)',
                          ),
                        ),
                      if (execution.pollingStopped || execution.error != null)
                        TextButton(
                          onPressed: execution.resume,
                          child: const Text('Refresh execution status'),
                        ),
                      if (execution.job != null && !execution.job!.terminal)
                        TextButton(
                          onPressed: execution.busy ? null : execution.cancel,
                          child: const Text('Cancel execution'),
                        ),
                      if (execution.job?.mode == 'submit')
                        FilledButton.tonal(
                          onPressed: () => review(execution.job!),
                          child: const Text(
                            'Open saved submission & AI review',
                          ),
                        ),
                    ],
                  ),
                  RefreshIndicator(
                    onRefresh: () => loadHistory(),
                    child: ListView(
                      padding: const EdgeInsets.all(12),
                      children: [
                        if (historyBusy) const LinearProgressIndicator(),
                        if (historyError != null) ...[
                          Text(ApiFailure.from(historyError!).userMessage),
                          TextButton(
                            onPressed: () => loadHistory(),
                            child: const Text('Retry history'),
                          ),
                        ],
                        if (history.isEmpty &&
                            !historyBusy &&
                            historyError == null)
                          const Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'No saved submissions for this problem version.',
                            ),
                          ),
                        for (final job in history)
                          Card(
                            child: ListTile(
                              title: Text(job.label),
                              subtitle: Text(job.data['createdAt'] as String),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => review(job),
                            ),
                          ),
                        if (historyCursor != null)
                          TextButton(
                            onPressed: historyBusy
                                ? null
                                : () => loadHistory(more: true),
                            child: const Text('Load older submissions'),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (capabilityError != null)
              TextButton(
                onPressed: () async {
                  try {
                    final value = await api!.capabilities(p);
                    if (mounted) {
                      setState(() {
                        capabilities = value;
                        capabilityError = null;
                      });
                    }
                  } catch (e) {
                    if (mounted) setState(() => capabilityError = e);
                  }
                },
                child: const Text('Execution unavailable · Retry capabilities'),
              ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                            !execution.active && capabilities['run'] == true
                            ? () => execute('run')
                            : null,
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Run'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed:
                            !execution.active && capabilities['submit'] == true
                            ? () => execute('submit')
                            : null,
                        icon: const Icon(Icons.send),
                        label: const Text('Submit'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (capabilities['submit'] != true &&
                capabilities['submitReason'] is String)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(capabilities['submitReason'] as String),
              ),
          ],
        ),
      ),
    );
  }
}
