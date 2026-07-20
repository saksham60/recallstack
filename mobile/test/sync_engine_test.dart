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

class MockApiClient extends Mock implements ApiClient {}
class MockDio extends Mock implements Dio {}
class MockSyncStatusNotifier extends SyncStatusNotifier {
  bool isSyncing = false;
  @override
  void setSyncing(bool value) {
    isSyncing = value;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppDatabase db;
  late MockApiClient mockApiClient;
  late MockDio mockDio;
  late MockSyncStatusNotifier mockSyncStatusNotifier;

  setUp(() {
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
      ],
    );

    final syncEngine = SyncEngine(mockApiClient, db, container.read(Provider((ref) => ref)));
    
    final result = await syncEngine.runSync();
    
    expect(result, equals(SyncResult.authRequired));
    expect(mockSyncStatusNotifier.isSyncing, false);
  });

  test('runSync completes successfully if authenticated', () async {
    final user = const supabase.User(
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
}
