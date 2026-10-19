import 'dart:async';
import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/canonical_models.dart';
import 'package:app/features/dsa/catalog_controller.dart';
import 'package:app/features/dsa/catalog_screen.dart';
import 'package:app/features/dsa/intelligence_report.dart';
import 'package:app/features/dsa/python_editor.dart';
import 'package:app/features/dsa/report_view.dart';
import 'package:app/features/feed/presentation/feed_preferences_sheet.dart';
import 'package:app/shared/theme/app_theme.dart';
import 'package:app/shared/widgets/states.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/canonical_fixture.dart';

class PartialMetadataApi extends CanonicalDsaApi {
  PartialMetadataApi() : super(Dio(), Dio());
  bool failBookmarks = true;
  Completer<List<Json>>? firstProgress;
  Completer<void>? bookmarkWrite;
  int progressReads = 0, bookmarkWrites = 0;
  @override
  Future<List<Json>> categories({CancelToken? token}) async => [];
  @override
  Future<List<Json>> progress({CancelToken? token}) async {
    if (progressReads++ == 0 && firstProgress != null) {
      return firstProgress!.future;
    }
    return [
      {
        'problemId': problemId,
        'problemVersionId': problemVersion,
        'executionStatus': 'solved',
        'learningStatus': 'new',
      },
    ];
  }

  @override
  Future<Set<String>> bookmarks({CancelToken? token}) async {
    if (failBookmarks) throw StateError('Bookmarks unavailable');
    return {};
  }

  @override
  Future<void> bookmark(String id, bool save) async {
    bookmarkWrites++;
    await bookmarkWrite?.future;
  }
}

void main() {
  test(
    'optional bookmark failure does not hide successful learner progress',
    () async {
      final api = PartialMetadataApi();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.loadMetadata();
      expect(controller.bookmarksError, isNotNull);
      expect(controller.progressError, isNull);
      expect(
        completionLabel(controller.progress[problemId], problemVersion),
        'Solved',
      );
      api.failBookmarks = false;
      await controller.loadMetadata();
      expect(controller.metadataError, isNull);
    },
  );

  test('late metadata responses cannot overwrite a newer refresh', () async {
    final api = PartialMetadataApi()..firstProgress = Completer<List<Json>>();
    final controller = CatalogController(api);
    addTearDown(controller.dispose);
    final previous = controller.loadMetadata();
    await controller.loadMetadata();
    api.firstProgress!.complete([]);
    await previous;
    expect(controller.progress[problemId]?['executionStatus'], 'solved');
  });

  test('repeated bookmark taps share one acknowledged write', () async {
    final api = PartialMetadataApi()..bookmarkWrite = Completer<void>();
    final controller = CatalogController(api);
    addTearDown(controller.dispose);
    final p = Problem.parse(problemFixture());
    final saving = controller.toggleBookmark(p);
    await controller.toggleBookmark(p);
    expect(api.bookmarkWrites, 1);
    expect(controller.bookmarks, isEmpty);
    api.bookmarkWrite!.complete();
    await saving;
    expect(controller.bookmarks, contains(problemId));
  });

  test(
    'earlier-version passes are labelled without solving the new version',
    () {
      expect(
        completionLabel({
          'problemVersionId': 'older',
          'executionStatus': 'solved',
          'learningStatus': 'new',
        }, problemVersion),
        'Not started · Passed earlier version',
      );
    },
  );

  testWidgets(
    'catalog shows companies and progress together on a narrow screen',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final server = ContractServer(count: 1);
      final dio = Dio(BaseOptions(baseUrl: 'https://fixture.test/api/v1/'))
        ..httpClientAdapter = server;
      final web = Dio(BaseOptions(baseUrl: 'https://fixture.test/'))
        ..httpClientAdapter = server;
      final controller = CatalogController(CanonicalDsaApi(dio, web));
      addTearDown(controller.dispose);
      await tester.runAsync(() => controller.load());
      expect(controller.companyError, isNull);
      controller.progress[problemId] = {
        'problemVersionId': problemVersion,
        'executionStatus': 'passed_current_tests',
      };
      await tester.pumpWidget(
        ProviderScope(
          overrides: [catalogControllerProvider.overrideWithValue(controller)],
          child: MaterialApp(
            theme: buildTheme(),
            home: const DsaExplorerScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Fixture Co'), findsOneWidget);
      expect(
        find.textContaining('easy · Passed current tests'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'AI report has readable fields and fits 320dp at large text scale',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final analysis = object(
        object(reportFixture('completed')['report'])['analysis'],
      );
      final correctness = object(analysis['correctness']);
      correctness['edgeCases'] = ['Empty input', 'Repeated values'];
      analysis['correctness'] = correctness;
      await tester.pumpWidget(
        MaterialApp(
          theme: buildTheme(),
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(1.6)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: CodeIntelligenceReport(analysis: analysis),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Edge cases to consider'), findsOneWidget);
      expect(find.text('edgeCases'), findsNothing);
      expect(find.text('earlierAttempts'), findsNothing);
      expect(find.text('O(n)'), findsOneWidget);
      await tester.drag(
        find.byType(SingleChildScrollView).first,
        const Offset(0, -900),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'provisional verdict never displays an officially Accepted label',
    (tester) async {
      final data = executionFixture(verdict: 'provisional_pass');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ExecutionCard(job: Execution.parse(data))),
        ),
      );
      expect(find.text('Passed current tests'), findsOneWidget);
      expect(find.textContaining('not an officially Accepted'), findsOneWidget);
      expect(find.text('Accepted'), findsNothing);
    },
  );

  testWidgets('editor selection movement does not trigger draft writes', (
    tester,
  ) async {
    final code = PythonController(
      text: 'def solve(nums):\n    return sum(nums)',
    );
    addTearDown(code.dispose);
    var edits = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PythonEditor(controller: code, onChanged: () => edits++),
        ),
      ),
    );
    code.selection = const TextSelection.collapsed(offset: 4);
    await tester.pump();
    expect(edits, 0);
    code.insert('total');
    await tester.pump();
    expect(edits, 1);
  });

  testWidgets(
    'empty states and preferences remain usable with little vertical space',
    (tester) async {
      tester.view.physicalSize = const Size(320, 500);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: buildTheme(),
          home: const Scaffold(
            body: SizedBox(
              height: 140,
              child: EmptyState(
                icon: Icons.search,
                title: 'Nothing here yet',
                body: 'Change a filter or try another search.',
              ),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            feedPreferencesProvider.overrideWith(
              (ref) async => {'topics': [], 'interestPrompt': ''},
            ),
          ],
          child: MaterialApp(
            theme: buildTheme(),
            home: const MediaQuery(
              data: MediaQueryData(
                size: Size(320, 500),
                viewInsets: EdgeInsets.only(bottom: 250),
              ),
              child: Scaffold(body: FeedPreferencesSheet()),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Save'),
        100,
        scrollable: find
            .descendant(
              of: find.byType(FeedPreferencesSheet),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Save').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
