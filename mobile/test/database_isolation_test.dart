import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/database/database.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  group('Database Isolation', () {
    test('Authenticated users have isolated sqlite files', () async {
      final dbA = AppDatabase('userA');
      final dbB = AppDatabase('userB');

      // Insert data into user A
      await dbA.into(dbA.userNotes).insert(UserNotesCompanion.insert(
        id: 'note-1',
        contentId: 'item-1',
        type: 'note',
        body: 'note body',
        rowVersion: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ));

      // Verify data is in user A
      final notesA = await dbA.select(dbA.userNotes).get();
      expect(notesA.length, 1);
      expect(notesA.first.id, 'note-1');

      // Verify data is NOT in user B
      final notesB = await dbB.select(dbB.userNotes).get();
      expect(notesB.isEmpty, true);

      // Insert data into user B
      await dbB.into(dbB.userNotes).insert(UserNotesCompanion.insert(
        id: 'note-2',
        contentId: 'item-2',
        type: 'note',
        body: 'note body 2',
        rowVersion: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ));

      // Verify user A still only has their data
      final notesA_after = await dbA.select(dbA.userNotes).get();
      expect(notesA_after.length, 1);
      expect(notesA_after.first.id, 'note-1');

      await dbA.close();
      await dbB.close();
    });
  });
}
