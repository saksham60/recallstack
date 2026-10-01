import 'package:app/features/feed/presentation/feed_models.dart';
import 'package:app/features/feed/presentation/feed_screen.dart';
import 'package:app/shared/theme/app_theme.dart';
import 'package:app/shared/widgets/app_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final story = Story.parse({
    'id': 'story-1',
    'title':
        'A long engineering headline that should remain readable on a smaller Android phone',
    'summary':
        'A deliberately long summary about trade-offs, practical constraints, and why this change matters to a working developer.',
    'whyItMatters': 'It changes an implementation decision.',
    'source': {'name': 'Test Source', 'key': 'test'},
    'sourceUrl': 'https://example.com/story',
    'imageUrl': null,
    'publishedAt': DateTime.now().toUtc().toIso8601String(),
    'topics': ['developer-tools'],
    'viewerState': {'saved': false},
    'importanceScore': 1,
    'qualityScore': 1,
  });

  for (final (width, height, viewport, textScale)
      in <(double, double, double, double)>[
        (320, 640, 420, 1),
        (320, 640, 420, 1.2),
        (360, 780, 560, 1),
        (412, 915, 690, 1),
      ]) {
    testWidgets(
      'complete Feed card fits ${width.toInt()}dp screen at $textScale text scale',
      (tester) async {
        tester.view.physicalSize = Size(width, height);
        tester.view.devicePixelRatio = 1;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });

        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              theme: buildTheme(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(textScale)),
                child: child!,
              ),
              home: Scaffold(
                body: Align(
                  alignment: Alignment.topCenter,
                  child: SizedBox(
                    width: width - 32,
                    child: StoryCard(
                      story: story,
                      viewportHeight: viewport,
                      onTap: () {},
                    ),
                  ),
                ),
              ),
            ),
          ),
        );

        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.byType(Card)).height,
          lessThan(viewport * 0.9),
        );
        expect(
          tester.getSize(find.byType(AppNetworkImage)).height,
          lessThanOrEqualTo(viewport * 0.34 + 1),
        );
        expect(find.textContaining('ReasonAI'), findsOneWidget);
        final title = tester.widget<Text>(find.text(story.title));
        expect(title.maxLines, 2);
      },
    );
  }
}
