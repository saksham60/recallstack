import 'package:flutter_test/flutter_test.dart';
import 'package:drift_dev/api/migrations_native.dart';
import 'package:app/core/database/database.dart';
import 'package:drift/drift.dart' as drift;
import 'generated_migrations/schema.dart';

void main() {
  late SchemaVerifier verifier;

  setUpAll(() {
    verifier = SchemaVerifier(GeneratedHelper());
  });

  test(
    'upgrade from v1 to v2 preserves data and adds primaryPracticeUrl',
    () async {
      // 1. Create a database at schema version 1
      final connection = await verifier.startAt(1);
      final db1 = AppDatabase.forTesting(connection);

      // Insert sample data in v1
      await db1
          .into(db1.categories)
          .insert(
            CategoriesCompanion.insert(
              id: 'cat-1',
              domainId: 'domain-1',
              title: 'Test Category',
              sortOrder: 1,
              updatedAt: DateTime.now(),
            ),
          );

      await db1
          .into(db1.contentItems)
          .insert(
            ContentItemsCompanion.insert(
              id: 'item-1',
              categoryId: 'cat-1',
              title: 'Test Item',
              slug: 'test-item',
              type: 'concept',
              sortOrder: 1,
              updatedAt: DateTime.now(),
            ),
          );

      // Note: primary_practice_url does not exist in v1, so we don't insert it.

      // 2. Run the migration to version 2 and validate the schema
      await verifier.migrateAndValidate(db1, 2);

      // 3. Verify data is preserved and new column exists
      final items = await db1.select(db1.contentItems).get();
      expect(items.length, 1);
      expect(items.first.id, 'item-1');
      expect(items.first.title, 'Test Item');

      // Verify we can write to the new column
      await db1
          .update(db1.contentItems)
          .replace(
            items.first.copyWith(
              primaryPracticeUrl: const drift.Value(
                'https://example.com/practice',
              ),
            ),
          );

      final updatedItem = await (db1.select(
        db1.contentItems,
      )..where((t) => t.id.equals('item-1'))).getSingle();
      expect(updatedItem.primaryPracticeUrl, 'https://example.com/practice');

      await db1.close();
    },
  );
}
