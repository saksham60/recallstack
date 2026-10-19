import 'dart:async';
import 'dart:convert';
import 'package:app/core/db/app_database.dart';
import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/canonical_models.dart';
import 'package:app/features/dsa/catalog_controller.dart';
import 'package:app/features/dsa/execution_session.dart';
import 'package:app/features/dsa/python_editor.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/canonical_fixture.dart';

void main() {
  late ContractServer server;
  late CanonicalDsaApi api;
  late AppDatabase db;
  setUp(() {
    server = ContractServer(count: 375);
    final backend = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1/'))
      ..httpClientAdapter = server;
    final web = Dio(BaseOptions(baseUrl: 'https://web.test/'))
      ..httpClientAdapter = server;
    api = CanonicalDsaApi(backend, web);
    db = AppDatabase.forTesting(NativeDatabase.memory());
  });
  tearDown(() async {
    await db.close();
  });
  test(
    'all 375 catalog entries use efficient server cursors and company/completion filters',
    () async {
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      expect(controller.problems, hasLength(50));
      await controller.loadAll();
      expect(controller.problems, hasLength(375));
      expect(controller.hasMore, isFalse);
      expect(
        server.requests.where((r) => r.uri.path.endsWith('/dsa/problems')),
        hasLength(8),
      );
      expect(
        server.requests.where((r) => r.uri.path.contains('/problems/')),
        isEmpty,
      );
      await controller.loadMetadata();
      controller.company = 'fixture-co';
      expect(controller.visible, hasLength(375));
      controller.progress[problemId] = {
        'problemVersionId': problemVersion,
        'executionStatus': 'solved',
      };
      controller.completion = 'solved';
      expect(controller.visible.single.id, problemId);
      controller.completion = 'unsolved';
      expect(controller.visible, hasLength(374));
      await controller.toggleBookmark(Problem.parse(problemFixture()));
      controller.completion = 'bookmarked';
      expect(controller.visible.single.id, problemId);
    },
  );
  test(
    'catalog sends actual search/difficulty/category contracts and reads public problem cases',
    () async {
      await api.catalog(
        search: '  array  ',
        category: categoryId,
        difficulty: 'easy',
      );
      expect(
        server.requests.single.queryParameters,
        containsPair('search', 'array'),
      );
      expect(
        server.requests.single.queryParameters,
        containsPair('category', categoryId),
      );
      final p = await api.problem(problemSlug, version: problemVersion);
      expect(p.description, isNotEmpty);
      expect((await api.tests(p)).single['expected_output_json'], 3);
      expect(
        pythonStarter(await api.capabilities(p), p.contract),
        contains('def solve(nums: list[int]) -> int:'),
      );
    },
  );
  test(
    'unknown create response survives restart and retries original code/key exactly once on server',
    () async {
      final p = Problem.parse(problemFixture());
      final first = ExecutionSession(
        api,
        db,
        p,
        pollDelay: const Duration(hours: 1),
      );
      server.loseNextCreate = true;
      const code = 'def solve(nums):\n    return 90071992547409931234567890';
      await first.start(code, 'submit');
      expect(first.pending, isNotNull);
      expect(server.launches, 1);
      final original = jsonEncode(first.pending);
      first.dispose();
      final recovered = ExecutionSession(
        api,
        db,
        p,
        pollDelay: const Duration(hours: 1),
      );
      addTearDown(recovered.dispose);
      await recovered.restore();
      expect(jsonEncode(recovered.pending), original);
      await recovered.retryCreate();
      expect(server.launches, 1);
      expect(recovered.pending, isNull);
      expect(recovered.job!.id, submissionId);
      expect(server.jobs.values.single['code'], code);
      expect(server.jobs.values.single['language'], 'python');
      expect(
        jsonEncode(
          server.requests
              .where((r) => r.uri.path == '/api/dsa/executions')
              .first
              .data,
        ),
        jsonEncode(
          server.requests
              .where((r) => r.uri.path == '/api/dsa/executions')
              .last
              .data,
        ),
      );
    },
  );
  test(
    'polling reaches a real terminal DTO, stops, and notifies completion once',
    () async {
      var finished = 0;
      final done = Completer<void>();
      final controller = ExecutionSession(
        api,
        db,
        Problem.parse(problemFixture()),
        pollDelay: const Duration(milliseconds: 2),
        onTerminal: () {
          finished++;
          if (!done.isCompleted) done.complete();
        },
      );
      addTearDown(controller.dispose);
      await controller.start('def solve(nums): return sum(nums)', 'submit');
      await done.future.timeout(const Duration(seconds: 3));
      expect(controller.job!.label, 'Accepted');
      expect(finished, 1);
      final requests = server.requests.length;
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(server.requests.length, requests);
      await controller.resume();
      expect(finished, 1);
    },
  );
  test(
    'submission history/report retry use saved server endpoints without another execution',
    () async {
      final p = Problem.parse(problemFixture());
      await api.create({
        'problemId': p.id,
        'problemVersionId': p.version,
        'code': 'def solve(nums): return sum(nums)',
        'mode': 'submit',
        'language': 'python',
        'idempotencyKey': '60000000-0000-4000-8000-000000000001',
      });
      expect((await api.history(p)).items.single.id, submissionId);
      server.reportStatus = 'failed';
      expect((await api.report(submissionId)).status, 'failed');
      expect((await api.report(submissionId, retry: true)).status, 'completed');
      expect(server.reportRetries, 1);
      expect(server.launches, 1);
    },
  );
  test(
    'defensive parsing rejects unsupported states and mismatched problem ownership',
    () {
      expect(
        () =>
            Execution.parse({...executionFixture(), 'status': 'magic_success'}),
        throwsFormatException,
      );
      expect(
        () => Problem.parse({'title': 'No identifiers'}),
        throwsFormatException,
      );
      expect(
        () => Execution.parse(
          executionFixture(),
        ).requireScope(Problem.parse(problemFixture(2))),
        throwsFormatException,
      );
      expect(AiReport.parse(reportFixture('queued')).pending, isTrue);
      expect(AiReport.parse(reportFixture('completed')).pending, isFalse);
      expect(verdictLabel('provisional_pass'), 'Passed current tests');
    },
  );
  test(
    'account-local receipts, code and approach use separate version keys',
    () async {
      final other = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(other.close);
      final p = Problem.parse(problemFixture());
      await db.upsertDraft(p.draftKey, 'Approach', 'source');
      await db.writeRecord('receipt', 'private pointer');
      expect((await db.getDraft(p.draftKey))!.code, 'source');
      expect(await other.getDraft(p.draftKey), isNull);
      expect(await other.readRecord('receipt'), isNull);
      expect(
        await db.getDraft(
          p.draftKey.replaceFirst(problemVersion, 'other-version'),
        ),
        isNull,
      );
    },
  );
}
