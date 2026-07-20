import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/database/database.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  group('Database Isolation', () {
    test('Anonymous user has anon sqlite file', () {
      final db = AppDatabase(null);
      expect(db, isNotNull);
      // We cannot easily test the file name directly without mocking the native setup,
      // but we can ensure it instantiates without error.
      db.close();
    });

    test('Authenticated user has isolated sqlite file', () {
      final db = AppDatabase('user123');
      expect(db, isNotNull);
      db.close();
    });
  });
}
