import 'package:flutter_test/flutter_test.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:app/core/database/database.dart';
import 'generated_migrations/schema.dart';

void main() {
  late SchemaVerifier verifier;

  setUpAll(() {
    verifier = SchemaVerifier(GeneratedHelper());
  });

  test('upgrade from v1 to v2 preserves data and adds primaryPracticeUrl', () async {
    // 1. Create a database at schema version 1
    final connection = await verifier.startAt(1);

    // 2. Run the migration to version 2 and validate the schema
    final migratedDb = AppDatabase.forTesting(connection);
    await verifier.migrateAndValidate(migratedDb, 2);

    await migratedDb.close();
  });
}
