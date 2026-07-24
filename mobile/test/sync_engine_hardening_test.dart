import 'package:app/core/api/api_client.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_engine.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;

class _MockApiClient extends Mock implements ApiClient {}

class _MockDio extends Mock implements Dio {}

class _SyncHarness {
  _SyncHarness._(this.db, this.dio, this.container, this.engine);

  final AppDatabase db;
  final _MockDio dio;
  final ProviderContainer container;
  final SyncEngine engine;

  static Future<_SyncHarness> create({
    bool catalogCursor = true,
    bool userCursor = true,
  }) async {
    final db = AppDatabase(null);
    final apiClient = _MockApiClient();
    final dio = _MockDio();
    when(() => apiClient.client).thenReturn(dio);

    const user = supabase.User(
      id: 'test-user',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(user),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    await db
        .into(db.deviceState)
        .insert(
          DeviceStateCompanion.insert(
            id: 'current',
            deviceId: 'device-1',
            registeredAt: DateTime(2026),
          ),
        );
    if (catalogCursor) {
      await db
          .into(db.syncCursors)
          .insert(
            SyncCursorsCompanion.insert(
              id: 'catalog_dsa',
              cursorValue: '7',
              updatedAt: DateTime(2026),
            ),
          );
    }
    if (userCursor) {
      await db
          .into(db.syncCursors)
          .insert(
            SyncCursorsCompanion.insert(
              id: 'user',
              cursorValue: '10',
              updatedAt: DateTime(2026),
            ),
          );
    }

    final ref = container.read(Provider<Ref>((ref) => ref));
    return _SyncHarness._(db, dio, container, SyncEngine(apiClient, db, ref));
  }

  void stubCatalogNoChanges() {
    when(
      () => dio.get(
        '/sync/catalog/dsa',
        queryParameters: any(named: 'queryParameters'),
      ),
    ).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/sync/catalog/dsa'),
        data: {
          'changes': <dynamic>[],
          'next_cursor': 7,
          'has_more': false,
          'full_resync_required': false,
        },
      ),
    );
  }

  void stubUserNoChanges() {
    when(
      () =>
          dio.get('/sync/user', queryParameters: any(named: 'queryParameters')),
    ).thenAnswer(
      (_) async => Response(
        requestOptions: RequestOptions(path: '/sync/user'),
        data: {'changes': <dynamic>[], 'next_cursor': 10, 'has_more': false},
      ),
    );
  }

  Future<void> close() async {
    container.dispose();
    await db.close();
  }
}

Response<dynamic> _response(String path, Object? data) {
  return Response<dynamic>(
    requestOptions: RequestOptions(path: path),
    data: data,
  );
}

DioException _dioError(
  String path, {
  int? statusCode,
  DioExceptionType type = DioExceptionType.badResponse,
}) {
  final options = RequestOptions(path: path);
  return DioException(
    requestOptions: options,
    type: type,
    response: statusCode == null
        ? null
        : Response<dynamic>(requestOptions: options, statusCode: statusCode),
  );
}

Future<void> _insertMutation(
  AppDatabase db,
  String id, {
  String payload = '{}',
  String mutationType = 'save_note',
}) {
  return db
      .into(db.localOutbox)
      .insert(
        LocalOutboxCompanion.insert(
          mutationId: id,
          mutationType: mutationType,
          entityType: 'note',
          entityId: 'note-$id',
          payloadJson: payload,
          status: 'pending',
          createdAt: DateTime(2026),
        ),
      );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    PackageInfo.setMockInitialValues(
      appName: 'RecallStack',
      packageName: 'com.recallstack.app',
      version: '1.0.0',
      buildNumber: '1',
      buildSignature: '',
    );
  });

  group('local mutation payload validation', () {
    for (final testCase in <(String, String, String)>[
      ('invalid JSON', '{bad', 'malformed_mutation_payload'),
      ('JSON array', '[]', 'invalid_mutation_payload_shape'),
      ('JSON string', '"value"', 'invalid_mutation_payload_shape'),
      ('JSON number', '42', 'invalid_mutation_payload_shape'),
    ]) {
      test('${testCase.$1} is rejected and never sent', () async {
        final harness = await _SyncHarness.create();
        addTearDown(harness.close);
        harness.stubCatalogNoChanges();
        harness.stubUserNoChanges();
        await _insertMutation(harness.db, 'invalid', payload: testCase.$2);

        expect(await harness.engine.runSync(), SyncResult.success);

        final mutation = await harness.db
            .select(harness.db.localOutbox)
            .getSingle();
        expect(mutation.status, 'rejected');
        expect(mutation.lastError, testCase.$3);
        verifyNever(
          () => harness.dio.post(
            '/sync/mutations/batch',
            data: any(named: 'data'),
          ),
        );
      });
    }

    test('valid object is sent when another mutation is malformed', () async {
      final harness = await _SyncHarness.create();
      addTearDown(harness.close);
      harness.stubCatalogNoChanges();
      harness.stubUserNoChanges();
      await _insertMutation(harness.db, 'bad', payload: '{bad');
      await _insertMutation(harness.db, 'good', payload: '{"body":"ok"}');
      when(
        () =>
            harness.dio.post('/sync/mutations/batch', data: any(named: 'data')),
      ).thenAnswer((invocation) async {
        final body = invocation.namedArguments[#data]! as Map<String, dynamic>;
        final mutations = body['mutations']! as List<dynamic>;
        expect(mutations, hasLength(1));
        expect(
          (mutations.single as Map<String, dynamic>)['mutation_id'],
          'good',
        );
        return _response('/sync/mutations/batch', {
          'results': [
            {'mutation_id': 'good', 'status': 'applied'},
          ],
        });
      });

      expect(await harness.engine.runSync(), SyncResult.success);
      final bad = await (harness.db.select(
        harness.db.localOutbox,
      )..where((row) => row.mutationId.equals('bad'))).getSingle();
      expect(bad.status, 'rejected');
      expect(
        await (harness.db.select(
          harness.db.localOutbox,
        )..where((row) => row.mutationId.equals('good'))).getSingleOrNull(),
        isNull,
      );
    });

    test(
      'malformed payload stays rejected when valid peer gets offline error',
      () async {
        final harness = await _SyncHarness.create();
        addTearDown(harness.close);
        await _insertMutation(harness.db, 'bad', payload: '{bad');
        await _insertMutation(harness.db, 'good');
        when(
          () => harness.dio.post(
            '/sync/mutations/batch',
            data: any(named: 'data'),
          ),
        ).thenThrow(
          _dioError(
            '/sync/mutations/batch',
            type: DioExceptionType.connectionTimeout,
          ),
        );

        expect(await harness.engine.runSync(), SyncResult.offline);
        final rows = {
          for (final row
              in await harness.db.select(harness.db.localOutbox).get())
            row.mutationId: row,
        };
        expect(rows['bad']!.status, 'rejected');
        expect(rows['bad']!.lastError, 'malformed_mutation_payload');
        expect(rows['good']!.status, 'retryable');
        expect(rows['good']!.retryCount, 1);
      },
    );

    test('unknown mutation type is rejected and never sent', () async {
      final harness = await _SyncHarness.create();
      addTearDown(harness.close);
      harness.stubCatalogNoChanges();
      harness.stubUserNoChanges();
      await _insertMutation(
        harness.db,
        'unknown',
        mutationType: 'invented_note_operation',
      );

      expect(await harness.engine.runSync(), SyncResult.success);
      final row = await harness.db.select(harness.db.localOutbox).getSingle();
      expect(row.status, 'rejected');
      expect(row.lastError, 'unknown_mutation_type');
      verifyNever(
        () =>
            harness.dio.post('/sync/mutations/batch', data: any(named: 'data')),
      );
    });
  });

  group('batch response validation', () {
    Future<_SyncHarness> runBatch(Object? results) async {
      final harness = await _SyncHarness.create();
      harness.stubCatalogNoChanges();
      harness.stubUserNoChanges();
      await _insertMutation(harness.db, 'm1');
      await _insertMutation(harness.db, 'm2');
      when(
        () =>
            harness.dio.post('/sync/mutations/batch', data: any(named: 'data')),
      ).thenAnswer(
        (_) async => _response('/sync/mutations/batch', {'results': results}),
      );
      expect(await harness.engine.runSync(), SyncResult.success);
      return harness;
    }

    test('complete response handles applied and duplicate', () async {
      final harness = await runBatch([
        {'mutation_id': 'm1', 'status': 'applied'},
        {'mutation_id': 'm2', 'status': 'duplicate'},
      ]);
      addTearDown(harness.close);
      expect(await harness.db.select(harness.db.localOutbox).get(), isEmpty);
    });

    test('partial response retries the missing submitted ID', () async {
      final harness = await runBatch([
        {'mutation_id': 'm1', 'status': 'applied'},
      ]);
      addTearDown(harness.close);
      final row = await harness.db.select(harness.db.localOutbox).getSingle();
      expect(row.mutationId, 'm2');
      expect(row.status, 'retryable');
      expect(row.retryCount, 1);
      expect(row.lastError, 'missing_batch_result');
      expect(row.nextRetryAt, isNotNull);
    });

    test('empty response retries every submitted ID', () async {
      final harness = await runBatch(<dynamic>[]);
      addTearDown(harness.close);
      final rows = await harness.db.select(harness.db.localOutbox).get();
      expect(rows, hasLength(2));
      expect(rows.every((row) => row.status == 'retryable'), isTrue);
      expect(
        rows.every((row) => row.lastError == 'missing_batch_result'),
        isTrue,
      );
    });

    test('unknown returned ID cannot modify unrelated outbox rows', () async {
      final harness = await runBatch([
        {'mutation_id': 'unknown', 'status': 'applied'},
      ]);
      addTearDown(harness.close);
      final rows = await harness.db.select(harness.db.localOutbox).get();
      expect(rows.map((row) => row.mutationId).toSet(), {'m1', 'm2'});
      expect(rows.every((row) => row.status == 'retryable'), isTrue);
    });

    test('duplicate returned ID is processed only once', () async {
      final harness = await runBatch([
        {'mutation_id': 'm1', 'status': 'applied'},
        {'mutation_id': 'm1', 'status': 'conflict'},
        {'mutation_id': 'm2', 'status': 'rejected', 'error_code': 'bad'},
      ]);
      addTearDown(harness.close);
      final rows = await harness.db.select(harness.db.localOutbox).get();
      expect(rows, hasLength(1));
      expect(rows.single.mutationId, 'm2');
      expect(rows.single.status, 'rejected');
    });

    for (final testCase in <(String, Object)>[
      ('non-object result', 'bad-result'),
      ('missing mutation_id', <String, dynamic>{'status': 'applied'}),
      (
        'null mutation_id',
        <String, dynamic>{'mutation_id': null, 'status': 'applied'},
      ),
      (
        'wrong mutation_id type',
        <String, dynamic>{'mutation_id': 1, 'status': 'applied'},
      ),
      ('missing status', <String, dynamic>{'mutation_id': 'm1'}),
      ('null status', <String, dynamic>{'mutation_id': 'm1', 'status': null}),
      (
        'wrong status type',
        <String, dynamic>{'mutation_id': 'm1', 'status': 1},
      ),
    ]) {
      test('${testCase.$1} cannot crash the batch', () async {
        final harness = await runBatch([testCase.$2]);
        addTearDown(harness.close);
        final rows = await harness.db.select(harness.db.localOutbox).get();
        expect(rows, hasLength(2));
        expect(rows.every((row) => row.status == 'retryable'), isTrue);
      });
    }

    test('unknown status is rejected explicitly', () async {
      final harness = await runBatch([
        {'mutation_id': 'm1', 'status': 'invented'},
        {'mutation_id': 'm2', 'status': 'conflict', 'error_code': 99},
      ]);
      addTearDown(harness.close);
      final rows = {
        for (final row in await harness.db.select(harness.db.localOutbox).get())
          row.mutationId: row,
      };
      expect(rows['m1']!.status, 'rejected');
      expect(rows['m1']!.lastError, 'invalid_status_from_server');
      expect(rows['m2']!.status, 'conflict');
      expect(rows['m2']!.lastError, isNull);
    });

    test('non-list results cannot crash the batch', () async {
      final harness = await runBatch({'mutation_id': 'm1'});
      addTearDown(harness.close);
      final rows = await harness.db.select(harness.db.localOutbox).get();
      expect(rows.every((row) => row.status == 'retryable'), isTrue);
    });
  });

  group('catalog projection safety', () {
    Future<_SyncHarness> catalogHarness(Object documentResult) async {
      final harness = await _SyncHarness.create();
      harness.stubUserNoChanges();
      when(
        () => harness.dio.get(
          '/sync/catalog/dsa',
          queryParameters: any(named: 'queryParameters'),
        ),
      ).thenAnswer(
        (_) async => _response('/sync/catalog/dsa', {
          'changes': [
            {
              'operation': 'upsert',
              'entity_type': 'content_item',
              'entity_id': 'new-item',
            },
          ],
          'next_cursor': 8,
          'has_more': false,
          'full_resync_required': false,
        }),
      );
      when(() => harness.dio.get('/domains/dsa/categories')).thenAnswer(
        (_) async => _response('/domains/dsa/categories', [
          {
            'id': 'new-category',
            'name': 'New Category',
            'description': null,
            'sort_order': 0,
          },
        ]),
      );
      when(
        () => harness.dio.get('/categories/new-category/content'),
      ).thenAnswer(
        (_) async => _response('/categories/new-category/content', {
          'items': [
            {
              'id': 'new-item',
              'title': 'New Item',
              'slug': 'new-item',
              'type': 'concept',
              'sort_order': 0,
            },
          ],
        }),
      );
      if (documentResult is DioException) {
        when(
          () => harness.dio.get('/content/new-item'),
        ).thenThrow(documentResult);
      } else {
        when(() => harness.dio.get('/content/new-item')).thenAnswer(
          (_) async => _response('/content/new-item', documentResult),
        );
      }
      return harness;
    }

    test('document 404 continues and advances catalog cursor', () async {
      final harness = await catalogHarness(
        _dioError('/content/new-item', statusCode: 404),
      );
      addTearDown(harness.close);
      expect(await harness.engine.runSync(), SyncResult.success);
      expect(
        (await harness.db.select(harness.db.syncCursors).get())
            .firstWhere((row) => row.id == 'catalog_dsa')
            .cursorValue,
        '8',
      );
      expect(
        await harness.db.select(harness.db.contentItems).get(),
        hasLength(1),
      );
      expect(
        await harness.db.select(harness.db.contentDocuments).get(),
        isEmpty,
      );
    });

    for (final testCase in <(String, DioException, SyncResult)>[
      (
        'document 500 returns serverFailure',
        _dioError('/content/new-item', statusCode: 500),
        SyncResult.serverFailure,
      ),
      (
        'document timeout returns offline',
        _dioError('/content/new-item', type: DioExceptionType.receiveTimeout),
        SyncResult.offline,
      ),
    ]) {
      test(testCase.$1, () async {
        final harness = await catalogHarness(testCase.$2);
        addTearDown(harness.close);
        expect(await harness.engine.runSync(), testCase.$3);
        final cursor = await (harness.db.select(
          harness.db.syncCursors,
        )..where((row) => row.id.equals('catalog_dsa'))).getSingle();
        expect(cursor.cursorValue, '7');
        expect(await harness.db.select(harness.db.contentItems).get(), isEmpty);
      });
    }
  });

  group('full resync fail-safe behavior', () {
    Future<_SyncHarness> fullResyncHarness() async {
      final harness = await _SyncHarness.create();
      harness.stubUserNoChanges();
      await harness.db
          .into(harness.db.categories)
          .insert(
            CategoriesCompanion.insert(
              id: 'old-category',
              domainId: 'dsa',
              title: 'Old Category',
              sortOrder: 0,
              updatedAt: DateTime(2025),
            ),
          );
      await harness.db
          .into(harness.db.contentItems)
          .insert(
            ContentItemsCompanion.insert(
              id: 'old-item',
              categoryId: 'old-category',
              title: 'Old Item',
              slug: 'old-item',
              type: 'concept',
              sortOrder: 0,
              updatedAt: DateTime(2025),
            ),
          );
      when(
        () => harness.dio.get(
          '/sync/catalog/dsa',
          queryParameters: {'device_id': 'device-1', 'after': '7'},
        ),
      ).thenAnswer(
        (_) async => _response('/sync/catalog/dsa', {
          'changes': <dynamic>[],
          'next_cursor': 7,
          'has_more': false,
          'full_resync_required': true,
        }),
      );
      return harness;
    }

    Future<void> expectOldCatalogPreserved(_SyncHarness harness) async {
      expect(
        (await harness.db.select(harness.db.categories).get()).single.id,
        'old-category',
      );
      expect(
        (await harness.db.select(harness.db.contentItems).get()).single.id,
        'old-item',
      );
      final cursor = await (harness.db.select(
        harness.db.syncCursors,
      )..where((row) => row.id.equals('catalog_dsa'))).getSingle();
      expect(cursor.cursorValue, '7');
    }

    test('snapshot fetch failure preserves old catalog and cursor', () async {
      final harness = await fullResyncHarness();
      addTearDown(harness.close);
      when(
        () => harness.dio.get('/domains/dsa/categories'),
      ).thenThrow(_dioError('/domains/dsa/categories', statusCode: 500));
      expect(await harness.engine.runSync(), SyncResult.serverFailure);
      await expectOldCatalogPreserved(harness);
    });

    for (final testCase in <(String, DioException, SyncResult)>[
      (
        'cursor fetch network failure preserves old catalog and cursor',
        _dioError(
          '/sync/catalog/dsa',
          type: DioExceptionType.connectionTimeout,
        ),
        SyncResult.offline,
      ),
      (
        'cursor fetch 500 preserves old catalog and cursor',
        _dioError('/sync/catalog/dsa', statusCode: 500),
        SyncResult.serverFailure,
      ),
    ]) {
      test(testCase.$1, () async {
        final harness = await fullResyncHarness();
        addTearDown(harness.close);
        when(() => harness.dio.get('/domains/dsa/categories')).thenAnswer(
          (_) async => _response('/domains/dsa/categories', <dynamic>[]),
        );
        when(
          () => harness.dio.get(
            '/sync/catalog/dsa',
            queryParameters: {'device_id': 'device-1'},
          ),
        ).thenThrow(testCase.$2);
        expect(await harness.engine.runSync(), testCase.$3);
        await expectOldCatalogPreserved(harness);
      });
    }

    for (final testCase in <(String, Map<String, dynamic>)>[
      (
        'full_resync_required true does not replace catalog',
        {'next_cursor': 20, 'has_more': false, 'full_resync_required': true},
      ),
      (
        'has_more true is not accepted as a terminal cursor',
        {'next_cursor': 20, 'has_more': true, 'full_resync_required': false},
      ),
      (
        'unbound terminal feed cursor does not replace catalog',
        {'next_cursor': 20, 'has_more': false, 'full_resync_required': false},
      ),
    ]) {
      test(testCase.$1, () async {
        final harness = await fullResyncHarness();
        addTearDown(harness.close);
        when(() => harness.dio.get('/domains/dsa/categories')).thenAnswer(
          (_) async => _response('/domains/dsa/categories', <dynamic>[]),
        );
        when(
          () => harness.dio.get(
            '/sync/catalog/dsa',
            queryParameters: {'device_id': 'device-1'},
          ),
        ).thenAnswer((_) async => _response('/sync/catalog/dsa', testCase.$2));
        expect(await harness.engine.runSync(), SyncResult.partialFailure);
        await expectOldCatalogPreserved(harness);
      });
    }
  });

  group('review projection result semantics', () {
    Future<_SyncHarness> reviewHarness(Object reviewResult) async {
      final harness = await _SyncHarness.create();
      harness.stubCatalogNoChanges();
      when(
        () => harness.dio.get(
          '/sync/user',
          queryParameters: any(named: 'queryParameters'),
        ),
      ).thenAnswer(
        (_) async => _response('/sync/user', {
          'changes': [
            {
              'operation': 'upsert',
              'entity_type': 'review_card',
              'entity_id': 'card-1',
            },
          ],
          'next_cursor': 11,
          'has_more': false,
        }),
      );
      for (final path in ['/me/progress', '/me/bookmarks', '/me/notes']) {
        when(
          () => harness.dio.get(
            path,
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => _response(path, {
            'items': <dynamic>[],
            'pagination': {'total_pages': 1},
          }),
        );
      }
      if (reviewResult is DioException) {
        when(
          () => harness.dio.get(
            '/me/reviews/due',
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenThrow(reviewResult);
      } else {
        when(
          () => harness.dio.get(
            '/me/reviews/due',
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer((_) async => _response('/me/reviews/due', reviewResult));
      }
      return harness;
    }

    for (final testCase in <(String, Object, SyncResult)>[
      (
        'review 500 returns serverFailure',
        _dioError('/me/reviews/due', statusCode: 500),
        SyncResult.serverFailure,
      ),
      (
        'review timeout returns offline',
        _dioError('/me/reviews/due', type: DioExceptionType.receiveTimeout),
        SyncResult.offline,
      ),
      (
        'review 401 returns authRequired',
        _dioError('/me/reviews/due', statusCode: 401),
        SyncResult.authRequired,
      ),
      (
        'malformed review response returns partialFailure',
        <dynamic>[],
        SyncResult.partialFailure,
      ),
    ]) {
      test('${testCase.$1} without advancing user cursor', () async {
        final harness = await reviewHarness(testCase.$2);
        addTearDown(harness.close);
        expect(await harness.engine.runSync(), testCase.$3);
        final cursor = await (harness.db.select(
          harness.db.syncCursors,
        )..where((row) => row.id.equals('user'))).getSingle();
        expect(cursor.cursorValue, '10');
      });
    }

    test('valid empty due list succeeds and advances user cursor', () async {
      final harness = await reviewHarness({
        'items': <dynamic>[],
        'pagination': {'total_pages': 1},
      });
      addTearDown(harness.close);
      expect(await harness.engine.runSync(), SyncResult.success);
      final cursor = await (harness.db.select(
        harness.db.syncCursors,
      )..where((row) => row.id.equals('user'))).getSingle();
      expect(cursor.cursorValue, '11');
    });
  });
}
