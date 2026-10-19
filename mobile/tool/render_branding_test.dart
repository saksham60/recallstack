// Deterministic raster exports of the existing ReasonAI SVG geometry.
// Run from mobile: flutter test tool/render_branding_test.dart
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('export ReasonAI launcher and splash assets', () async {
    expect(Directory('android/app/src/main/res').existsSync(), isTrue);
    Future<Uint8List> render(int size) async {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder)..scale(size / 64);
      canvas.drawColor(const ui.Color(0xff09090b), ui.BlendMode.src);
      canvas.translate(32, 32);
      canvas.rotate(0.7853981633974483);
      canvas.translate(-32, -32);
      final outer = ui.RRect.fromRectAndRadius(
        const ui.Rect.fromLTWH(14, 14, 36, 36),
        const ui.Radius.circular(8),
      );
      canvas.drawRRect(outer, ui.Paint()..color = const ui.Color(0x1fa78bfa));
      canvas.drawRRect(
        outer,
        ui.Paint()
          ..color = const ui.Color(0xffa78bfa)
          ..style = ui.PaintingStyle.stroke
          ..strokeWidth = 4,
      );
      canvas.drawRRect(
        ui.RRect.fromRectAndRadius(
          const ui.Rect.fromLTWH(25, 25, 14, 14),
          const ui.Radius.circular(4),
        ),
        ui.Paint()..color = const ui.Color(0xffa78bfa),
      );
      final picture = recorder.endRecording();
      final image = await picture.toImage(size, size);
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List();
      image.dispose();
      picture.dispose();
      return bytes;
    }

    Future<void> write(String path, int size) async {
      final file = File(path);
      await file.parent.create(recursive: true);
      await file.writeAsBytes(await render(size));
    }

    for (final entry in {
      'mdpi': 48,
      'hdpi': 72,
      'xhdpi': 96,
      'xxhdpi': 144,
      'xxxhdpi': 192,
    }.entries) {
      await write(
        'android/app/src/main/res/mipmap-${entry.key}/ic_launcher.png',
        entry.value,
      );
    }
    for (final platform in ['ios', 'macos']) {
      final dir = '$platform/Runner/Assets.xcassets/AppIcon.appiconset';
      final contents =
          jsonDecode(await File('$dir/Contents.json').readAsString()) as Map;
      for (final entry in (contents['images'] as List).whereType<Map>()) {
        final name = entry['filename'];
        if (name is! String) continue;
        final size = double.parse((entry['size'] as String).split('x').first);
        final scale = double.parse(
          (entry['scale'] as String).replaceAll('x', ''),
        );
        await write('$dir/$name', (size * scale).round());
      }
    }
    for (var scale = 1; scale <= 3; scale++) {
      await write(
        'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage${scale == 1 ? '' : '@${scale}x'}.png',
        96 * scale,
      );
    }
    for (final size in [192, 512]) {
      for (final mask in ['', '-maskable']) {
        await write('web/icons/Icon$mask-$size.png', size);
      }
    }
    await write('web/favicon.png', 32);
    final png = await render(256);
    final header = ByteData(22)
      ..setUint16(2, 1, Endian.little)
      ..setUint16(4, 1, Endian.little)
      ..setUint16(10, 1, Endian.little)
      ..setUint16(12, 32, Endian.little)
      ..setUint32(14, png.length, Endian.little)
      ..setUint32(18, 22, Endian.little);
    await File(
      'windows/runner/resources/app_icon.ico',
    ).writeAsBytes([...header.buffer.asUint8List(), ...png]);
    await write('assets/brand/reasonai-1024.png', 1024);
  });
}
