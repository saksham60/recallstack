import 'dart:io';
import 'package:yaml/yaml.dart';

void main() {
  final lockFile = File('pubspec.lock');
  if (!lockFile.existsSync()) return;
  final lock = loadYaml(lockFile.readAsStringSync());
  final pkgs = lock['packages'];
  for (var k in pkgs.keys) {
    print('$k: ^${pkgs[k]['version']}');
  }
}
