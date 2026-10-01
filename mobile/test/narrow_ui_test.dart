import 'package:app/core/reasonai/reasonai_widgets.dart';
import 'package:app/core/reasonai/visual_lesson.dart';
import 'package:app/features/dsa/dsa_api.dart';
import 'package:app/features/dsa/dsa_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('DSA category card fits a 320dp screen', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          categoriesProvider.overrideWith(
            (ref) async => [
              {
                'id': 'category-id',
                'name': 'A long category title for small phones',
                'description':
                    'A long description that wraps across several lines.',
                'progress_percentage': 45,
                'mastered_count': 2,
                'total_content_items': 8,
              },
            ],
          ),
        ],
        child: const MaterialApp(home: DsaCategoriesScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('mastered'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('visual lesson advances and asks about selected step', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final lesson = VisualLesson.tryParse({
      'title': 'Array trace',
      'kind': 'array',
      'steps': [
        {
          'title': 'Start',
          'explanation': 'Start here',
          'values': ['1', '2'],
        },
        {
          'title': 'Move',
          'explanation': 'Move right',
          'values': ['1', '2'],
          'highlights': [1],
        },
      ],
    })!;
    int? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: VisualLessonView(
              lesson: lesson,
              onAskAboutStep: (_, step) => selected = step,
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Next'));
    await tester.pump();
    expect(find.textContaining('Step 2 of 2'), findsOneWidget);
    await tester.tap(find.text('Ask ReasonAI about this step'));
    expect(selected, 2);
    expect(tester.takeException(), isNull);
  });
}
