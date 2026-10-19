import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/api/api_failure.dart';
import 'canonical_api.dart';
import 'canonical_models.dart';
import 'intelligence_report.dart';

class ExecutionCard extends StatelessWidget {
  const ExecutionCard({super.key, required this.job});
  final Execution job;
  @override
  Widget build(BuildContext context) {
    final result = job.result;
    final provisional =
        result?['verdict'] == 'provisional_pass' ||
        result?['gradingLevel'] == 'provisional' ||
        job.data['gradingLevel'] == 'provisional';
    final positive = {
      'accepted',
      'passed_public_tests',
    }.contains(result?['verdict']);
    final color = provisional
        ? const Color(0xFFF0BA6A)
        : positive
        ? const Color(0xFF55DBAD)
        : result == null
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.error;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  provisional
                      ? Icons.science_outlined
                      : positive
                      ? Icons.check_circle_outline
                      : result == null
                      ? Icons.hourglass_top
                      : Icons.error_outline,
                  color: color,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    job.label,
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(color: color),
                  ),
                ),
              ],
            ),
            Text(
              '${job.mode == 'run' ? 'Public Run' : 'Submit'} · ${job.status}',
            ),
            if (provisional)
              const Text(
                'Current-suite result; this is not an officially Accepted verdict.',
              ),
            if (result?['passedTests'] is num && result?['totalTests'] is num)
              Text(
                '${result!['passedTests']}/${result['totalTests']} tests passed',
              ),
            for (final pair in [
              ('executionTimeMs', 'Runtime', 'ms'),
              ('wallTimeMs', 'Wall time', 'ms'),
              ('memoryKiB', 'Memory', 'KiB'),
            ])
              if (result?[pair.$1] is num)
                Text('${pair.$2}: ${result![pair.$1]} ${pair.$3}'),
            if (job.error != null) Text(job.error!),
            // Submit has no case-level output UI, even if a malformed DTO includes it.
            if (job.mode == 'run' && result?['publicCases'] is List)
              for (final item in objects(result!['publicCases']))
                ExpansionTile(
                  title: Text(
                    verdictLabel(item['verdict'] as String? ?? 'unknown'),
                  ),
                  children: [
                    SelectableText(
                      'Input: ${pretty(item['input'])}\nExpected: ${pretty(item['expectedOutput'])}\nActual: ${pretty(item['actualOutput'])}',
                    ),
                    if (item['stdout'] is String)
                      SelectableText(item['stdout'] as String),
                    if (item['stderr'] is String)
                      SelectableText(item['stderr'] as String),
                  ],
                ),
          ],
        ),
      ),
    );
  }
}

class SubmissionDetails extends StatefulWidget {
  const SubmissionDetails({
    super.key,
    required this.api,
    required this.problem,
    required this.initial,
    required this.onDiscuss,
  });
  final CanonicalDsaApi api;
  final Problem problem;
  final Execution initial;
  final void Function(String id, String source) onDiscuss;
  @override
  State<SubmissionDetails> createState() => _SubmissionDetailsState();
}

class _SubmissionDetailsState extends State<SubmissionDetails>
    with WidgetsBindingObserver {
  late Execution job;
  AiReport? saved;
  String? error;
  bool busy = false, paused = false, stopped = false;
  int generation = 0, polls = 0, failures = 0;
  Timer? timer;
  CancelToken? token;
  bool get eligible =>
      job.mode == 'submit' &&
      {'completed', 'timed_out'}.contains(job.status) &&
      job.result != null;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    job = widget.initial;
    Future.microtask(refresh);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    generation++;
    timer?.cancel();
    token?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    paused = state != AppLifecycleState.resumed;
    if (paused) {
      generation++;
      timer?.cancel();
      token?.cancel();
      busy = false;
    } else {
      polls = 0;
      failures = 0;
      refresh();
    }
  }

  Future<void> refresh({bool retry = false}) async {
    if (!mounted || busy || paused) return;
    timer?.cancel();
    final current = ++generation;
    final active = token = CancelToken();
    setState(() {
      busy = true;
      error = null;
      stopped = false;
    });
    try {
      if (!job.terminal) {
        final result = await widget.api.execution(job.id, token: active);
        result.requireScope(widget.problem, submissionId: job.id);
        if (!mounted || current != generation) return;
        job = result;
      }
      if (eligible) {
        final report = await widget.api.report(
          job.id,
          retry: retry,
          token: active,
        );
        if (!mounted || current != generation) return;
        saved = report;
      }
      failures = 0;
      polls++;
    } catch (e) {
      if (!mounted || current != generation || active.isCancelled) return;
      error = ApiFailure.from(e).userMessage;
      failures++;
    } finally {
      if (mounted && current == generation) {
        setState(() => busy = false);
        final pending =
            !job.terminal ||
            saved?.pending == true ||
            (error != null && eligible);
        if (pending && polls < 120 && failures < 5 && !paused) {
          timer = Timer(Duration(seconds: 2 * (failures + 1)), refresh);
        } else if (pending) {
          setState(() => stopped = true);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      children: [
        ListTile(
          title: const Text('Submission & AI review'),
          subtitle: Text(
            widget.problem.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: IconButton(
            tooltip: 'Close review',
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              ExecutionCard(job: job),
              if (error != null) Text(error!),
              if (busy) const LinearProgressIndicator(),
              if (stopped || error != null)
                TextButton(
                  onPressed: () {
                    polls = 0;
                    failures = 0;
                    refresh();
                  },
                  child: const Text('Refresh saved status'),
                ),
              if (eligible) ...[
                Text(
                  saved == null
                      ? 'Loading Code Intelligence…'
                      : !saved!.enabled
                      ? 'Code Intelligence is unavailable.'
                      : reportStatusLabel(saved!.status),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (saved?.status == 'failed') ...[
                  const Text('The judge result is saved. AI review failed.'),
                  TextButton(
                    onPressed: busy ? null : () => refresh(retry: true),
                    child: const Text('Retry AI Review'),
                  ),
                ],
                if (saved?.status == 'rate_limited')
                  const Text(
                    'The existing daily AI report allowance has been reached.',
                  ),
                if (saved?.analysis != null)
                  CodeIntelligenceReport(analysis: saved!.analysis!),
                if (saved != null)
                  ExpansionTile(
                    title: const Text('Submitted source · read only'),
                    children: [
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(
                            ClipboardData(text: saved!.source),
                          );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Submitted code copied'),
                              ),
                            );
                          }
                        },
                        icon: const Icon(Icons.copy),
                        label: const Text('Copy submitted code'),
                      ),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: SelectableText(
                          saved!.source,
                          style: const TextStyle(fontFamily: 'monospace'),
                        ),
                      ),
                    ],
                  ),
                if (saved != null)
                  FilledButton.icon(
                    onPressed: () {
                      final id = job.id, source = saved!.source;
                      Navigator.pop(context);
                      widget.onDiscuss(id, source);
                    },
                    icon: const Icon(Icons.auto_awesome),
                    label: const Text('Discuss with ReasonAI'),
                  ),
                const Text(
                  'AI complexity and optimization notes are estimates; the saved judge verdict remains authoritative.',
                ),
              ] else if (job.terminal)
                const Text(
                  'This execution has no eligible judged Submit result for Code Intelligence.',
                ),
            ],
          ),
        ),
      ],
    ),
  );
}

String reportStatusLabel(String? status) =>
    const {
      'queued': 'Code Intelligence queued',
      'generating': 'Reviewing your solution…',
      'completed': 'Code Intelligence',
      'failed': 'AI review unavailable',
      'rate_limited': 'Daily review limit reached',
    }[status] ??
    'Waiting for Code Intelligence';
