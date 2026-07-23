import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:dio/dio.dart';
import 'package:app/core/api/api_client.dart';
import 'package:app/core/database/database.dart';
import 'package:app/core/sync/sync_engine.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/core/auth/supabase_auth_repository.dart';
import 'package:app/core/sync/sync_status_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supabase;
import 'package:package_info_plus/package_info_plus.dart';

class MockApiClient extends Mock implements ApiClient {}
class MockDio extends Mock implements Dio {}
class MockSyncStatusNotifier extends SyncStatusNotifier {
  bool isSyncing = false;
  SyncStatus? lastResult;
  
  @override
  void setSyncing(bool value) {
    isSyncing = value;
    super.setSyncing(value);
  }

  @override
  void setResult(SyncStatus resultStatus) {
    lastResult = resultStatus;
    isSyncing = false;
    super.setResult(resultStatus);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppDatabase db;
  late MockApiClient mockApiClient;
  late MockDio mockDio;
  late MockSyncStatusNotifier mockSyncStatusNotifier;

  setUp(() {
    PackageInfo.setMockInitialValues(
      appName: 'RecallStack Mobile',
      packageName: 'com.example.app',
      version: '1.0.0',
      buildNumber: '1',
      buildSignature: 'buildSignature',
    );
    db = AppDatabase(null); // use a temporary anon db for tests
    mockApiClient = MockApiClient();
    mockDio = MockDio();
    mockSyncStatusNotifier = MockSyncStatusNotifier();
    
    when(() => mockApiClient.client).thenReturn(mockDio);
  });

  tearDown(() async {
    await db.close();
  });

  test('runSync returns authRequired when no user', () async {
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(null),
        syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    
    expect(result, equals(SyncResult.authRequired));
    expect(mockSyncStatusNotifier.isSyncing, false);
  });

  test('runSync completes successfully if authenticated', () async {
    final user = supabase.User(
      id: 'test_user',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(user),
        syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    when(() => mockDio.post('/devices/register', data: any(named: 'data')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: '/devices/register'),
          data: {'id': 'test_device'},
        ));

    when(() => mockDio.post('/sync/mutations/batch', data: any(named: 'data')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'results': []},
        ));
        
    when(() => mockDio.get('/sync/catalog/dsa', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'changes': [], 'next_cursor': 1},
        ));
        
    when(() => mockDio.get('/sync/user', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'changes': [], 'next_cursor': 1},
        ));

    // Avoid full fetch in tests by populating cursors
    await db.into(db.syncCursors).insert(
      SyncCursorsCompanion.insert(id: 'catalog_dsa', cursorValue: '1', updatedAt: DateTime.now()),
    );
    await db.into(db.syncCursors).insert(
      SyncCursorsCompanion.insert(id: 'user', cursorValue: '1', updatedAt: DateTime.now()),
    );

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    expect(result, equals(SyncResult.success));
  });

  test('runSync returns authRequired on 401 DioException', () async {
    final user = supabase.User(
      id: 'test_user',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(user),
        syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    // Mock an auth failure during device registration (first step)
    when(() => mockDio.post('/devices/register', data: any(named: 'data')))
        .thenThrow(DioException(
          requestOptions: RequestOptions(path: '/devices/register'),
          response: Response(requestOptions: RequestOptions(path: ''), statusCode: 401),
        ));

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    expect(result, equals(SyncResult.authRequired));
    expect(mockSyncStatusNotifier.isSyncing, false);
  });

  test('runSync returns offline on other DioException', () async {
    final user = supabase.User(
      id: 'test_user',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(user),
        syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    // Mock an offline failure (e.g. SocketException wrapped in DioException)
    when(() => mockDio.post('/devices/register', data: any(named: 'data')))
        .thenThrow(DioException(
          requestOptions: RequestOptions(path: '/devices/register'),
          type: DioExceptionType.connectionError,
        ));

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    expect(result, equals(SyncResult.offline));
  });

  test('runSync aborts and returns serverFailure if /me/reviews/due fails', () async {
    final user = supabase.User(
      id: 'test_user',
      appMetadata: {},
      userMetadata: {},
      aud: 'authenticated',
      createdAt: '',
    );
    
    final container = ProviderContainer(
      overrides: [
        currentUserProvider.overrideWithValue(user),
        syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
        appDatabaseProvider.overrideWithValue(db),
      ],
    );

    when(() => mockDio.post('/devices/register', data: any(named: 'data')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: '/devices/register'),
          data: {'id': 'test_device'},
        ));

    when(() => mockDio.post('/sync/mutations/batch', data: any(named: 'data')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'results': []},
        ));
        
    when(() => mockDio.get('/sync/catalog/dsa', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'changes': [], 'next_cursor': 1},
        ));
        
    when(() => mockDio.get('/sync/user', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'changes': [], 'next_cursor': 1},
        ));

    // Mock progress, bookmarks, notes success
    when(() => mockDio.get('/me/progress', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'items': [], 'pagination': {'total_pages': 1}},
        ));
    when(() => mockDio.get('/me/bookmarks', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'items': [], 'pagination': {'total_pages': 1}},
        ));
    when(() => mockDio.get('/me/notes', queryParameters: any(named: 'queryParameters')))
        .thenAnswer((_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: {'items': [], 'pagination': {'total_pages': 1}},
        ));

    // Mock /me/reviews/due throwing 500
    when(() => mockDio.get('/me/reviews/due', queryParameters: any(named: 'queryParameters')))
        .thenThrow(DioException(
          requestOptions: RequestOptions(path: '/me/reviews/due'),
          response: Response(requestOptions: RequestOptions(path: ''), statusCode: 500),
        ));

    await db.into(db.syncCursors).insert(
      SyncCursorsCompanion.insert(id: 'catalog_dsa', cursorValue: '1', updatedAt: DateTime.now()),
    );

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    expect(result, equals(SyncResult.serverFailure)); // Should not be swallowed!
  });

  test('malformed JSON payload is rejected without failing batch', () async {
    final user = supabase.User(id: 'test_user', appMetadata: {}, userMetadata: {}, aud: 'authenticated', createdAt: '');
    final container = ProviderContainer(overrides: [
      currentUserProvider.overrideWithValue(user),
      syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
      appDatabaseProvider.overrideWithValue(db),
    ]);

    // Insert 2 mutations, one valid, one invalid JSON
    await db.into(db.localOutbox).insert(LocalOutboxCompanion.insert(
      mutationId: 'valid-1', mutationType: 'save_note', entityType: 'note', entityId: 'n1', payloadJson: '{"text":"hello"}', status: 'pending', createdAt: DateTime.now()));
    await db.into(db.localOutbox).insert(LocalOutboxCompanion.insert(
      mutationId: 'invalid-2', mutationType: 'save_note', entityType: 'note', entityId: 'n2', payloadJson: '{malformed}', status: 'pending', createdAt: DateTime.now()));

    await db.into(db.deviceState).insert(DeviceStateCompanion.insert(id: 'current', deviceId: 'dev-1', registeredAt: DateTime.now()));

    // Mock batch endpoint
    when(() => mockDio.post('/sync/mutations/batch', data: any(named: 'data'))).thenAnswer((inv) async {
      final data = inv.namedArguments[const Symbol('data')] as Map<String, dynamic>;
      final mutations = data['mutations'] as List<dynamic>;
      // Only the valid one should be sent
      expect(mutations.length, 1);
      expect(mutations.first['mutation_id'], 'valid-1');
      return Response(requestOptions: RequestOptions(path: ''), data: {'results': [{'mutation_id': 'valid-1', 'status': 'applied'}]});
    });

    // Mock catalog and user sync success
    when(() => mockDio.get('/sync/catalog/dsa', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'changes': [], 'next_cursor': 1}));
    when(() => mockDio.get('/sync/user', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'changes': [], 'next_cursor': 1}));
    when(() => mockDio.get('/me/progress', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/bookmarks', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/notes', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/reviews/due', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': []}));
    
    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    await syncEngine.runSync();

    // Invalid should be rejected locally
    final invalid = await (db.select(db.localOutbox)..where((t) => t.mutationId.equals('invalid-2'))).getSingle();
    expect(invalid.status, 'rejected');
    expect(invalid.lastError, 'malformed_mutation_payload');

    // Valid should be deleted (applied)
    final valid = await (db.select(db.localOutbox)..where((t) => t.mutationId.equals('valid-1'))).getSingleOrNull();
    expect(valid, isNull);
  });

  test('batch response parsing exact semantics (unknown ID, missing status, duplicate ID)', () async {
    final user = supabase.User(id: 'test_user', appMetadata: {}, userMetadata: {}, aud: 'authenticated', createdAt: '');
    final container = ProviderContainer(overrides: [
      currentUserProvider.overrideWithValue(user),
      syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
      appDatabaseProvider.overrideWithValue(db),
    ]);

    await db.into(db.localOutbox).insert(LocalOutboxCompanion.insert(
      mutationId: 'm1', mutationType: 'save_note', entityType: 'note', entityId: 'n1', payloadJson: '{}', status: 'pending', createdAt: DateTime.now()));
    await db.into(db.localOutbox).insert(LocalOutboxCompanion.insert(
      mutationId: 'm2', mutationType: 'save_note', entityType: 'note', entityId: 'n2', payloadJson: '{}', status: 'pending', createdAt: DateTime.now()));
    
    await db.into(db.deviceState).insert(DeviceStateCompanion.insert(id: 'current', deviceId: 'dev-1', registeredAt: DateTime.now()));

    when(() => mockDio.post('/sync/mutations/batch', data: any(named: 'data'))).thenAnswer((_) async {
      return Response(requestOptions: RequestOptions(path: ''), data: {
        'results': [
          {'mutation_id': 'm1', 'status': 'applied'},
          {'mutation_id': 'm1', 'status': 'conflict'}, // Duplicate, should be ignored
          {'mutation_id': 'unknown-3', 'status': 'applied'}, // Unknown, should be ignored
          {'mutation_id': 'm2'}, // Missing status, should be ignored (making m2 retryable)
        ]
      });
    });

    when(() => mockDio.get(any(), queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'changes': [], 'next_cursor': 1, 'items': [], 'pagination': {'total_pages': 1}}));

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    await syncEngine.runSync();

    // m1 was applied, duplicate conflict ignored, should be deleted
    final m1 = await (db.select(db.localOutbox)..where((t) => t.mutationId.equals('m1'))).getSingleOrNull();
    expect(m1, isNull);

    // m2 missing status in response, becomes retryable
    final m2 = await (db.select(db.localOutbox)..where((t) => t.mutationId.equals('m2'))).getSingle();
    expect(m2.status, 'retryable');
    expect(m2.lastError, 'missing_batch_result');
  });

  test('full resync aborts if full_resync_required=true on cursor fetch', () async {
    final user = supabase.User(id: 'test_user', appMetadata: {}, userMetadata: {}, aud: 'authenticated', createdAt: '');
    final container = ProviderContainer(overrides: [
      currentUserProvider.overrideWithValue(user),
      syncStatusProvider.overrideWith(() => mockSyncStatusNotifier),
      appDatabaseProvider.overrideWithValue(db),
    ]);

    await db.into(db.deviceState).insert(DeviceStateCompanion.insert(id: 'current', deviceId: 'dev-1', registeredAt: DateTime.now()));

    // Initial catalog fetch says full resync is required
    when(() => mockDio.get('/sync/catalog/dsa', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async {
      return Response(requestOptions: RequestOptions(path: ''), data: {'full_resync_required': true});
    });

    // We fetch categories and content
    when(() => mockDio.get('/domains/dsa/categories')).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: []));
    
    // Now we fetch terminal cursor, and it says full_resync_required again!
    // This should throw and abort safely.
    when(() => mockDio.get('/sync/catalog/dsa', queryParameters: {'device_id': 'dev-1'}))
      .thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'full_resync_required': true}));

    when(() => mockDio.get('/sync/user', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'changes': [], 'next_cursor': 1}));
    when(() => mockDio.get('/me/progress', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/bookmarks', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/notes', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': [], 'pagination': {'total_pages': 1}}));
    when(() => mockDio.get('/me/reviews/due', queryParameters: any(named: 'queryParameters'))).thenAnswer((_) async => Response(requestOptions: RequestOptions(path: ''), data: {'items': []}));

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    final result = await syncEngine.runSync();
    
    // Should fail with partial failure (because the exception was caught by runSync)
    expect(result, equals(SyncResult.partialFailure));
  });
}
