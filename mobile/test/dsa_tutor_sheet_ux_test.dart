import 'package:app/core/reasonai/reasonai_client.dart';
import 'package:app/core/reasonai/reasonai_widgets.dart';
import 'package:app/features/dsa/dsa_models.dart';
import 'package:app/features/dsa/dsa_tutor_sheet.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'mobile tutor sheet clears the status bar and supports dismissal',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      tester.view.padding = const FakeViewPadding(top: 24, bottom: 24);
      tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 24);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.view.resetPadding();
        tester.view.resetViewPadding();
        tester.view.resetViewInsets();
      });
      const note = StudyNote({
        'content_item_id': 'problem-1',
        'slug': 'chocolate-distribution',
        'title': 'Chocolate Distribution Problem With a Long Title',
        'type': 'problem',
        'blocks': [],
        'practice_resources': [],
      });
      await tester.pumpWidget(
        ProviderScope(
          overrides: [reasonAIDioProvider.overrideWith((ref) => Dio())],
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => Center(
                  child: FilledButton(
                    onPressed: () =>
                        showDsaTutor(context, note, approach: '', code: ''),
                    child: const Text('Open tutor'),
                  ),
                ),
              ),
              bottomNavigationBar: const SizedBox(
                height: 80,
                child: Center(child: Text('Bottom tabs')),
              ),
            ),
          ),
        ),
      );

      Future<void> open() async {
        await tester.tap(find.text('Open tutor'));
        await tester.pumpAndSettle();
      }

      await open();
      final title = find.textContaining('ReasonAI · Chocolate Distribution');
      expect(title, findsOneWidget);
      expect(tester.widget<Text>(title).maxLines, 1);
      expect(tester.widget<Text>(title).overflow, TextOverflow.ellipsis);
      expect(tester.getRect(title).top, greaterThan(24));
      expect(tester.getRect(find.byType(DsaTutorSheet)).top, greaterThan(24));
      expect(find.byTooltip('Close ReasonAI'), findsOneWidget);
      final messageHeight = tester.getRect(find.byType(ReasonAIThread)).height;
      expect(
        tester.getRect(find.byType(ReasonAIThread)).bottom,
        lessThanOrEqualTo(tester.getRect(find.text('Hint')).top),
      );
      expect(
        find.text(
          'Ask ReasonAI to examine the context, trade-offs, or next step.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);

      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(tester.getRect(title).top, greaterThan(24));
      expect(
        tester.getRect(find.byType(ReasonAIThread)).height,
        lessThan(messageHeight),
      );
      expect(
        tester.getRect(find.byType(ReasonAIComposer)).bottom,
        lessThanOrEqualTo(544),
      );
      expect(tester.takeException(), isNull);
      tester.view.resetViewInsets();
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Close ReasonAI'));
      await tester.pumpAndSettle();
      expect(find.byType(DsaTutorSheet), findsNothing);

      await open();
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
      expect(find.byType(DsaTutorSheet), findsNothing);

      await open();
      await tester.drag(
        find.byKey(const Key('dsa-tutor-drag-handle')),
        const Offset(0, 600),
      );
      await tester.pumpAndSettle();
      expect(find.byType(DsaTutorSheet), findsNothing);
    },
  );
}
