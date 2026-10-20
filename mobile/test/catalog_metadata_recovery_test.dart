import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:app/features/dsa/canonical_api.dart';
import 'package:app/features/dsa/canonical_models.dart';
import 'package:app/features/dsa/catalog_controller.dart';
import 'package:app/features/dsa/catalog_screen.dart';
import 'package:app/shared/theme/app_theme.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/canonical_fixture.dart';

class DsaBookmarkContract implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(options);
    final size = options.queryParameters['page_size'] as int;
    final page = options.queryParameters['page'] as int;
    final invalid = size > 50;
    final start = (page - 1) * size;
    return ResponseBody.fromString(
      jsonEncode(
        invalid
            ? {'detail': 'page_size must be at most 50'}
            : {
                'items': [
                  for (var i = start; i < start + size && i < 51; i++)
                    {'content_item_id': 'problem-$i'},
                ],
                'pagination': {'total_pages': (51 / size).ceil()},
              },
      ),
      invalid ? 422 : 200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class RecoverableCatalogApi extends CanonicalDsaApi {
  RecoverableCatalogApi() : super(Dio(), Dio());
  final catalogReads = <String?>[];
  final companyReads = <List<String>>[];
  final failingVersions = <String>{problemVersion};
  bool failBookmarks = false, failProgress = false, failCategories = false;
  int progressReads = 0, bookmarkReads = 0, categoryReads = 0;
  Completer<List<Json>>? nextCompanies;
  Completer<Set<String>>? nextBookmarks;

  @override
  Future<CatalogPage> catalog({
    String search = '',
    String? category,
    String? difficulty,
    String? cursor,
    CancelToken? token,
  }) async {
    catalogReads.add(cursor);
    return CatalogPage.parse({
      'items': [
        problemFixture(
          search.isNotEmpty
              ? 3
              : cursor == null
              ? 1
              : 2,
        ),
      ],
      'has_more': cursor == null,
      'next_cursor': cursor == null ? 'page2' : null,
    });
  }

  @override
  Future<List<Json>> companies(
    List<Problem> problems, {
    CancelToken? token,
  }) async {
    companyReads.add(problems.map((p) => p.version).toList());
    final pending = nextCompanies;
    nextCompanies = null;
    if (pending != null) return pending.future;
    if (problems.any((p) => failingVersions.contains(p.version))) {
      throw StateError('Company service unavailable');
    }
    return tags(problems);
  }

  List<Json> tags(List<Problem> problems) => [
    for (final p in problems)
      {
        'problemVersionId': p.version,
        'slug': 'fixture-co',
        'name': 'Fixture Co',
        'reviewStatus': 'reviewed',
      },
  ];

  @override
  Future<List<Json>> categories({CancelToken? token}) async {
    categoryReads++;
    if (failCategories) throw StateError('Categories unavailable');
    return [];
  }

  @override
  Future<List<Json>> progress({CancelToken? token}) async {
    progressReads++;
    if (failProgress) throw StateError('Progress unavailable');
    return [
      {
        'problemId': problemId,
        'problemVersionId': problemVersion,
        'executionStatus': 'solved',
      },
    ];
  }

  @override
  Future<Set<String>> bookmarks({CancelToken? token}) async {
    bookmarkReads++;
    final pending = nextBookmarks;
    nextBookmarks = null;
    if (pending != null) return pending.future;
    if (failBookmarks) throw StateError('Bookmarks unavailable');
    return {problemId};
  }
}

void main() {
  test(
    'canonical bookmarks respect the deployed 50-item limit and read every page',
    () async {
      final server = DsaBookmarkContract();
      final backend = Dio(BaseOptions(baseUrl: 'https://fixture.test/api/v1/'))
        ..httpClientAdapter = server;
      addTearDown(backend.close);
      // Reproduce the old request's HTTP validation failure.
      await expectLater(
        backend.get(
          'dsa/me/bookmarks',
          queryParameters: {'page': 1, 'page_size': 100},
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            422,
          ),
        ),
      );
      server.requests.clear();
      final bookmarks = await CanonicalDsaApi(backend, backend).bookmarks();
      expect(bookmarks, hasLength(51));
      expect(bookmarks, containsAll(['problem-0', 'problem-49', 'problem-50']));
      expect(server.requests.map((r) => r.queryParameters['page']), [1, 2]);
      expect(
        server.requests.map((r) => r.queryParameters['page_size']),
        everyElement(50),
      );
    },
  );

  test(
    'a later successful page cannot clear an earlier company failure',
    () async {
      final api = RecoverableCatalogApi();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.load(more: true);
      expect(controller.problems, hasLength(2));
      expect(controller.companiesFor(controller.problems.last), hasLength(1));
      expect(controller.companyError, isNotNull);
      expect(
        controller.metadataWarning,
        contains('Company matches may be incomplete'),
      );
    },
  );

  test(
    'company retry restores missing matches without reloading the catalog',
    () async {
      final api = RecoverableCatalogApi();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.loadMetadata();
      controller.company = 'fixture-co';
      controller.completion = 'solved';
      final problems = controller.problems, progress = controller.progress;
      expect(controller.visible, isEmpty);
      api.failingVersions.clear();
      await controller.retryMetadata();
      expect(controller.companyError, isNull);
      expect(controller.metadataWarning, isEmpty);
      expect(identical(controller.problems, problems), isTrue);
      expect(identical(controller.progress, progress), isTrue);
      expect(controller.cursor, 'page2');
      expect(controller.hasMore, isTrue);
      expect(controller.company, 'fixture-co');
      expect(controller.completion, 'solved');
      expect(controller.visible.single.id, problemId);
      expect(api.catalogReads, [null]);
      expect(api.companyReads, [
        [problemVersion],
        [problemVersion],
      ]);
      expect(api.progressReads, 1);
    },
  );

  test(
    'retry requests only failed pages and does not duplicate company tags',
    () async {
      final api = RecoverableCatalogApi();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.load(more: true);
      await controller
          .retryMetadata(); // Persistent failure must remain visible.
      expect(controller.companyError, isNotNull);
      api.failingVersions.clear();
      await controller.retryMetadata();
      await controller.retryMetadata(); // Nothing left to retry.
      expect(controller.companyError, isNull);
      expect(controller.companies, hasLength(2));
      expect(api.companyReads.skip(2), everyElement([problemVersion]));
      expect(api.companyReads, hasLength(4));
      expect(api.catalogReads, [null, 'page2']);
    },
  );

  test('refresh invalidates an in-flight company retry', () async {
    final api = RecoverableCatalogApi();
    final controller = CatalogController(api);
    addTearDown(controller.dispose);
    await controller.load();
    final oldProblems = controller.problems;
    final pending = api.nextCompanies = Completer<List<Json>>();
    final retry = controller.retryMetadata();
    expect(controller.retryBusy, isTrue);
    await controller.retryMetadata(); // No duplicate retry.
    controller.search = 'different';
    await controller.load();
    pending.complete(api.tags(oldProblems));
    await retry;
    expect(controller.companiesFor(oldProblems.single), isEmpty);
    expect(
      controller.companies.single['problemVersionId'],
      controller.problems.single.version,
    );
    expect(controller.companyError, isNull);
    expect(controller.retryBusy, isFalse);
    expect(api.companyReads, hasLength(3));
  });

  test(
    'a successful empty company response clears the error without inventing tags',
    () async {
      final api = RecoverableCatalogApi();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      final pending = api.nextCompanies = Completer<List<Json>>();
      final retry = controller.retryMetadata();
      pending.complete([]);
      await retry;
      expect(controller.companyError, isNull);
      expect(controller.companies, isEmpty);
    },
  );

  test(
    'bookmark-only retry retains successful progress and categories',
    () async {
      final api = RecoverableCatalogApi()..failBookmarks = true;
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.loadMetadata();
      expect(controller.metadataWarning, 'Bookmarks could not refresh.');
      final progress = controller.progress;
      final pending = api.nextBookmarks = Completer<Set<String>>();
      final retry = controller.retryMetadata();
      await controller.retryMetadata();
      expect(controller.metadataWarning, 'Bookmarks could not refresh.');
      expect(controller.progressBusy, isFalse);
      pending.complete({problemId});
      await retry;
      expect(controller.metadataError, isNull);
      expect(identical(controller.progress, progress), isTrue);
      expect(controller.bookmarks, contains(problemId));
      expect(api.categoryReads, 1);
      expect(api.progressReads, 1);
      expect(api.bookmarkReads, 2);
    },
  );

  test(
    'progress and category failures are accurately named and recover',
    () async {
      final api = RecoverableCatalogApi()
        ..failProgress = true
        ..failCategories = true;
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      controller.progress[problemId] = {'executionStatus': 'solved'};
      await controller.loadMetadata();
      expect(
        controller.metadataWarning,
        contains('Progress could not refresh.'),
      );
      expect(
        controller.metadataWarning,
        contains('Categories could not refresh.'),
      );
      expect(controller.metadataWarning, isNot(contains('company')));
      expect(controller.progress[problemId]?['executionStatus'], 'solved');
      api.failProgress = api.failCategories = false;
      await controller.retryMetadata();
      expect(controller.metadataError, isNull);
      expect(api.bookmarkReads, 1);
      expect(api.progressReads, 2);
      expect(api.categoryReads, 2);
    },
  );

  testWidgets(
    'bookmark warning preserves solved status, company tags and filters',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = RecoverableCatalogApi()..failBookmarks = true;
      api.failingVersions.clear();
      final controller = CatalogController(api);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.loadMetadata();
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
      expect(find.text('Bookmarks could not refresh.'), findsOneWidget);
      expect(find.textContaining('Progress or company'), findsNothing);
      expect(find.text('Fixture Co'), findsOneWidget);
      expect(find.textContaining('easy · Solved'), findsOneWidget);
      final statuses = tester
          .widgetList<DropdownButton<String>>(
            find.byType(DropdownButton<String>),
          )
          .last;
      expect(statuses.onChanged, isNotNull);
      expect(
        statuses.items!.firstWhere((i) => i.value == 'solved').enabled,
        isTrue,
      );
      expect(
        statuses.items!.firstWhere((i) => i.value == 'bookmarked').enabled,
        isFalse,
      );
      api.failBookmarks = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Bookmarks could not refresh.'), findsNothing);
      expect(find.textContaining('easy · Solved'), findsOneWidget);
      expect(api.catalogReads, [null]);
      expect(tester.takeException(), isNull);
    },
  );
}
