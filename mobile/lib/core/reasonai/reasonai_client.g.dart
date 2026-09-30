// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reasonai_client.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(reasonAIClient)
final reasonAIClientProvider = ReasonAIClientProvider._();

final class ReasonAIClientProvider
    extends $FunctionalProvider<ReasonAIClient, ReasonAIClient, ReasonAIClient>
    with $Provider<ReasonAIClient> {
  ReasonAIClientProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'reasonAIClientProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$reasonAIClientHash();

  @$internal
  @override
  $ProviderElement<ReasonAIClient> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReasonAIClient create(Ref ref) {
    return reasonAIClient(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReasonAIClient value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReasonAIClient>(value),
    );
  }
}

String _$reasonAIClientHash() => r'02082820e2837a662ab7af31773365d30155f79c';
